<template>
  <div class="settings-container" v-loading="loading">
    <el-scrollbar height="100%">
      <div class="settings-content">
        <el-alert
          v-if="error"
          :title="error"
          type="error"
          show-icon
          :closable="false"
          class="mb-4"
        />

        <el-form label-position="top">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12">
              <el-form-item label="FPM 预设方案">
                <template #label>
                  <span class="form-label">FPM 预设方案</span>
                  <span class="label-tip">根据容器内存选择推荐配置</span>
                </template>
                <el-select v-model="selectedPlanKey" placeholder="选择预设方案" style="width: 100%">
                  <el-option
                    v-for="plan in fpmPlans"
                    :key="plan.key"
                    :label="plan.label"
                    :value="plan.key"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="pm (进程管理模式)">
                <template #label>
                  <span class="form-label">pm</span>
                  <span class="label-tip">进程管理模式</span>
                </template>
                <el-select v-model="form.pm" placeholder="选择管理模式" style="width: 100%">
                  <el-option label="dynamic (动态)" value="dynamic" />
                  <el-option label="static (静态)" value="static" />
                  <el-option label="ondemand (按需)" value="ondemand" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :xs="24" :sm="8">
              <el-form-item label="pm.max_children">
                <template #label>
                  <span class="form-label">pm.max_children</span>
                </template>
                <el-input
                  v-model="form.pm_max_children"
                  type="number"
                  min="1"
                  placeholder="最大子进程数"
                />
                <div class="field-hint">最大并发处理进程数 (所有模式有效)</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-form-item label="pm.start_servers" :disabled="form.pm !== 'dynamic'">
                <template #label>
                  <span class="form-label">pm.start_servers</span>
                </template>
                <el-input
                  v-model="form.pm_start_servers"
                  type="number"
                  min="0"
                  placeholder="启动时进程数"
                  :disabled="form.pm !== 'dynamic'"
                />
                <div class="field-hint">启动时创建的子进程数 (仅限 dynamic)</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-form-item label="pm.min_spare_servers" :disabled="form.pm !== 'dynamic'">
                <template #label>
                  <span class="form-label">pm.min_spare_servers</span>
                </template>
                <el-input
                  v-model="form.pm_min_spare_servers"
                  type="number"
                  min="0"
                  placeholder="最小空闲进程数"
                  :disabled="form.pm !== 'dynamic'"
                />
                <div class="field-hint">保持的最小空闲子进程数 (仅限 dynamic)</div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :xs="24" :sm="8">
              <el-form-item label="pm.max_spare_servers" :disabled="form.pm !== 'dynamic'">
                <template #label>
                  <span class="form-label">pm.max_spare_servers</span>
                </template>
                <el-input
                  v-model="form.pm_max_spare_servers"
                  type="number"
                  min="0"
                  placeholder="最大空闲进程数"
                  :disabled="form.pm !== 'dynamic'"
                />
                <div class="field-hint">允许的最大空闲子进程数 (仅限 dynamic)</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-form-item label="pm.process_idle_timeout" :disabled="form.pm !== 'ondemand'">
                <template #label>
                  <span class="form-label">pm.process_idle_timeout</span>
                </template>
                <el-input
                  v-model="form.pm_process_idle_timeout"
                  placeholder="例如: 10s"
                  :disabled="form.pm !== 'ondemand'"
                />
                <div class="field-hint">进程空闲多久后被销毁 (仅限 ondemand)</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-form-item label="pm.max_requests">
                <template #label>
                  <span class="form-label">pm.max_requests</span>
                </template>
                <el-input
                  v-model="form.pm_max_requests"
                  type="number"
                  min="0"
                  placeholder="每个进程请求数"
                />
                <div class="field-hint">进程重启前可处理的最大请求数 (0 为无限制)</div>
              </el-form-item>
            </el-col>
          </el-row>

          <div class="form-actions">
            <el-button
              type="primary"
              :loading="saving"
              :disabled="loading"
              @click="saveSettings"
            >
              保存并应用
            </el-button>
            <el-button :disabled="loading || saving" @click="loadSettings">
              重新加载
            </el-button>
          </div>
        </el-form>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  nodeId: { type: String, default: '' },
  containerName: { type: String, default: '' },
})

const fpmPlans = [
  {
    key: '2g',
    label: '2G 小型站点',
    pm_max_children: '20',
    pm_start_servers: '5',
    pm_min_spare_servers: '4',
    pm_max_spare_servers: '10',
    pm_max_requests: '1000',
  },
  {
    key: '4g',
    label: '4G 中小型站点',
    pm_max_children: '40',
    pm_start_servers: '10',
    pm_min_spare_servers: '5',
    pm_max_spare_servers: '20',
    pm_max_requests: '1000',
  },
  {
    key: '6g',
    label: '6G 中型站点',
    pm_max_children: '60',
    pm_start_servers: '15',
    pm_min_spare_servers: '8',
    pm_max_spare_servers: '30',
    pm_max_requests: '1500',
  },
  {
    key: '8g',
    label: '8G 中大型站点',
    pm_max_children: '80',
    pm_start_servers: '20',
    pm_min_spare_servers: '10',
    pm_max_spare_servers: '40',
    pm_max_requests: '2000',
  },
  {
    key: '16g',
    label: '16G 大型站点',
    pm_max_children: '160',
    pm_start_servers: '40',
    pm_min_spare_servers: '20',
    pm_max_spare_servers: '80',
    pm_max_requests: '3000',
  },
]

const form = ref({
  pm: 'dynamic',
  pm_max_children: '',
  pm_start_servers: '',
  pm_min_spare_servers: '',
  pm_max_spare_servers: '',
  pm_process_idle_timeout: '',
  pm_max_requests: '',
})

const selectedPlanKey = ref('')

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const isDefault = ref(true)

const detectPlanFromForm = () => {
  const current = form.value
  if (current.pm !== 'dynamic') {
    selectedPlanKey.value = ''
    return
  }
  const found = fpmPlans.find((plan) => {
    return (
      String(current.pm_max_children || '') === String(plan.pm_max_children) &&
      String(current.pm_start_servers || '') === String(plan.pm_start_servers) &&
      String(current.pm_min_spare_servers || '') ===
        String(plan.pm_min_spare_servers) &&
      String(current.pm_max_spare_servers || '') === String(plan.pm_max_spare_servers) &&
      String(current.pm_max_requests || '') === String(plan.pm_max_requests)
    )
  })
  selectedPlanKey.value = found ? found.key : ''
}

watch(
  selectedPlanKey,
  (val) => {
    const plan = fpmPlans.find((item) => item.key === val)
    if (!plan) return
    form.value.pm = 'dynamic'
    form.value.pm_max_children = plan.pm_max_children
    form.value.pm_start_servers = plan.pm_start_servers
    form.value.pm_min_spare_servers = plan.pm_min_spare_servers
    form.value.pm_max_spare_servers = plan.pm_max_spare_servers
    form.value.pm_max_requests = plan.pm_max_requests
  },
)

const loadSettings = async () => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId || !containerName) {
    return
  }
  loading.value = true
  error.value = ''
  try {
    const keys = [
      'pm',
      'pm.max_children',
      'pm.start_servers',
      'pm.min_spare_servers',
      'pm.max_spare_servers',
      'pm.process_idle_timeout',
      'pm.max_requests',
    ]
    const qs = new URLSearchParams()
    qs.set('containerName', containerName)
    qs.set('keys', keys.join(','))
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/fpm/settings?${qs.toString()}`
    const resp = await fetch(url)
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '获取PHP-FPM配置失败'
      throw new Error(msg)
    }
    const resData = result.data || {}
    const data = (resData.data && typeof resData.data === 'object') ? resData.data : resData
    isDefault.value = !!resData.isDefault
    form.value.pm = data['pm'] || 'dynamic'
    form.value.pm_max_children =
      data['pm.max_children'] != null ? String(data['pm.max_children']) : ''
    form.value.pm_start_servers =
      data['pm.start_servers'] != null ? String(data['pm.start_servers']) : ''
    form.value.pm_min_spare_servers =
      data['pm.min_spare_servers'] != null ? String(data['pm.min_spare_servers']) : ''
    form.value.pm_max_spare_servers =
      data['pm.max_spare_servers'] != null ? String(data['pm.max_spare_servers']) : ''
    form.value.pm_process_idle_timeout =
      data['pm.process_idle_timeout'] != null ? String(data['pm.process_idle_timeout']) : ''
    form.value.pm_max_requests =
      data['pm.max_requests'] != null ? String(data['pm.max_requests']) : ''
    detectPlanFromForm()
  } catch (e) {
    error.value = String(e && e.message ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId) {
    error.value = '请选择节点'
    return
  }
  if (!containerName) {
    error.value = '容器信息缺失'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const settings = {
      pm: form.value.pm,
      'pm.max_children': form.value.pm_max_children,
      'pm.start_servers': form.value.pm_start_servers,
      'pm.min_spare_servers': form.value.pm_min_spare_servers,
      'pm.max_spare_servers': form.value.pm_max_spare_servers,
      'pm.process_idle_timeout': form.value.pm_process_idle_timeout,
      'pm.max_requests': form.value.pm_max_requests,
    }
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/fpm/settings`
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerName,
        settings,
      }),
    })
    const result = await resp.json().catch(() => null)
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '更新PHP-FPM配置失败'
      throw new Error(msg)
    }
    isDefault.value = false
    ElMessage.success(result.message || 'PHP-FPM配置已更新并重载')
    await loadSettings()
  } catch (e) {
    const msg = String(e && e.message ? e.message : '保存失败')
    error.value = msg
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.nodeId, props.containerName],
  () => {
    error.value = ''
    isDefault.value = true
    if (props.nodeId && props.containerName) {
      loadSettings()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.settings-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-content {
  padding: 20px;
}

@media (max-width: 1000px) {
  .settings-content {
    padding: 12px;
  }

  .form-actions {
    flex-direction: column;
    width: 100%;
  }

  .form-actions .el-button {
    margin-left: 0 !important;
    width: 100%;
  }
}

.form-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-right: 8px;
}

.label-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: normal;
}

.field-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

.form-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.mb-4 {
  margin-bottom: 16px;
}

:deep(.el-form-item__label) {
  padding-bottom: 8px;
}

:deep(.el-input-number .el-input__inner) {
  text-align: left;
}
</style>

