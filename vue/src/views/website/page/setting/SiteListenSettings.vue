<template>
  <div class="site-listen-settings">
    <div v-if="!site || !site.id" class="no-site-container">
      <el-empty description="请选择站点后配置协议与监听" :image-size="120" />
    </div>
    <div v-else class="settings-content">
      <el-row :gutter="20">
        <!-- 协议与端口 -->
        <el-col :xs="24" :sm="24" :md="12" class="mb-5">
          <el-card shadow="never" class="settings-card">
            <template #header>
              <div class="card-header">
                <span class="title">协议与端口</span>
              </div>
            </template>
            <div class="card-body">
              <div class="form-item mb-4">
                <div class="label mb-2">HTTP 端口</div>
                <el-input-number
                  v-model="form.listenPort"
                  :min="1"
                  :max="65535"
                  controls-position="right"
                  class="w-full"
                />
              </div>

              <div class="toggle-list">
                <div class="toggle-item">
                  <div class="toggle-text">
                    <div class="toggle-title">启用 HTTPS</div>
                    <div class="toggle-desc">为站点开启 443 端口并使用 SSL 证书</div>
                  </div>
                  <el-switch v-model="form.httpsEnabled" :disabled="saving" inline-prompt active-text="开" inactive-text="关" />
                </div>

                <div class="toggle-item">
                  <div class="toggle-text">
                    <div class="toggle-title">HTTP 跳转到 HTTPS</div>
                    <div class="toggle-desc">将所有非 ACME 请求 301 重定向到 HTTPS</div>
                  </div>
                  <el-switch
                    v-model="form.httpsRedirect"
                    :disabled="saving || !form.httpsEnabled"
                    inline-prompt active-text="开" inactive-text="关"
                  />
                </div>

                <div class="toggle-item">
                  <div class="toggle-text">
                    <div class="toggle-title">启用 HTTP/2</div>
                    <div class="toggle-desc">在 HTTPS 上启用 HTTP/2 协议</div>
                  </div>
                  <el-switch
                    v-model="form.http2Enabled"
                    :disabled="saving || !form.httpsEnabled"
                    inline-prompt active-text="开" inactive-text="关"
                  />
                </div>
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- 证书选择 -->
        <el-col :xs="24" :sm="24" :md="12" class="mb-5">
          <el-card shadow="never" class="settings-card">
            <template #header>
              <div class="card-header">
                <span class="title">证书选择</span>
                <el-button
                  type="primary"
                  size="small"
                  :loading="saving"
                  @click="handleSave"
                >
                  保存配置
                </el-button>
              </div>
            </template>
            <div class="card-body">
              <el-alert
                title="证书来源说明"
                type="info"
                :closable="false"
                show-icon
                class="mb-4"
              >
                <p class="tip-text">证书列表来自当前节点的「SSL证书」管理页面。若列表为空，请先在该页面申请或上传证书。</p>
              </el-alert>

              <div v-if="certError" class="mb-4">
                <el-alert :title="certError" type="error" :closable="false" show-icon />
              </div>

              <div class="form-item">
                <div class="label mb-2">证书名称</div>
                <el-select
                  v-model="form.certName"
                  placeholder="请选择证书"
                  :disabled="!form.httpsEnabled || saving || certLoading"
                  :loading="certLoading"
                  class="w-full"
                  filterable
                >
                  <el-option
                    v-for="cert in certOptions"
                    :key="cert.name"
                    :label="cert.label"
                    :value="cert.name"
                  />
                </el-select>
              </div>

              <div v-if="form.httpsEnabled && certOptions.length === 0" class="warn-msg mt-3">
                <el-alert
                  title="未检测到可用证书"
                  type="warning"
                  description="当前节点没有检测到可用证书，请先在上方菜单中的「SSL证书」页面申请或上传证书。"
                  :closable="false"
                  show-icon
                />
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  site: {
    type: Object,
    default: null,
  },
  nodeId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['refresh'])

const form = ref({
  listenPort: 80,
  httpsEnabled: false,
  httpsRedirect: false,
  http2Enabled: false,
  certName: '',
})

const saving = ref(false)
const certOptions = ref([])
const certLoading = ref(false)
const certError = ref('')

const resetFormFromSite = () => {
  if (!props.site || !props.site.id) return
  const cfg = props.site.config && typeof props.site.config === 'object' ? props.site.config : {}
  const listenPortRaw = cfg.listenPort
  const listenPortNumber = Number(listenPortRaw)
  form.value.listenPort =
    Number.isInteger(listenPortNumber) && listenPortNumber >= 1 && listenPortNumber <= 65535
      ? listenPortNumber
      : 80
  form.value.httpsEnabled = !!cfg.httpsEnabled
  form.value.httpsRedirect = !!cfg.httpsRedirect
  form.value.http2Enabled = !!cfg.http2Enabled
  form.value.certName = cfg.certName || ''
}

const loadCerts = async () => {
  if (!props.nodeId) {
    certOptions.value = []
    certError.value = ''
    return
  }
  certLoading.value = true
  certError.value = ''
  try {
    const resp = await fetch(`/api/forward/${props.nodeId}/website/ssl/certs`)
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || !data.success) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    const raw = data.data && Array.isArray(data.data.certs) ? data.data.certs : []
    const list = raw
      .map((item, index) => {
        const name = item && item.name ? String(item.name) : ''
        if (!name) return null
        const domains = Array.isArray(item.domains) ? item.domains : []
        let label = name
        if (domains.length > 0) {
          const primary = String(domains[0] || '').trim()
          if (primary) {
            label += `（${primary}`
            if (domains.length > 1) label += ' 等'
            label += '）'
          }
        }
        return {
          id: name || index,
          name,
          label,
        }
      })
      .filter((x) => x && x.name)
    certOptions.value = list
  } catch (e) {
    certError.value = e && e.message ? e.message : '获取证书列表失败'
    certOptions.value = []
  } finally {
    certLoading.value = false
  }
}

const handleSave = async () => {
  if (!props.nodeId) {
    ElMessage.error('请先选择节点')
    return
  }
  if (!props.site || !props.site.id) {
    ElMessage.error('请先选择站点')
    return
  }
  const portNumber = Number(form.value.listenPort)
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    ElMessage.error('HTTP 端口必须是 1 到 65535 之间的整数')
    return
  }
  if (form.value.httpsEnabled) {
    const name = String(form.value.certName || '').trim()
    if (!name) {
      ElMessage.error('启用 HTTPS 时必须选择证书，请先在「SSL证书管理」页面申请或上传证书')
      return
    }
  }
  saving.value = true
  try {
    const domain = props.site.primaryDomain || props.site.id
    const body = {
      listenPort: portNumber,
      httpsEnabled: !!form.value.httpsEnabled,
      httpsRedirect: !!form.value.httpsRedirect,
      http2Enabled: !!form.value.http2Enabled,
      certName: String(form.value.certName || '').trim(),
    }
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}`
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || !data.success) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    const reload = data.data && data.data.reload ? data.data.reload : null
    if (!reload || reload.success !== true) {
      ElMessage.error('配置出现错误，请尝试还原后保存')
      throw new Error('配置校验失败')
    }
    ElMessage.success('协议与监听配置已保存')
    emit('refresh')
  } catch (e) {
    const msg = e && e.message ? e.message : '保存配置失败'
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

watch(
  () => props.site,
  () => {
    resetFormFromSite()
  },
  { immediate: true },
)

watch(
  () => props.nodeId,
  () => {
    certOptions.value = []
    certError.value = ''
    if (props.nodeId) {
      loadCerts()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.site-listen-settings {
  margin-top: 16px;
}

.no-site-container {
  padding: 40px;
  background: var(--el-fill-color-blank);
  border-radius: 12px;
  border: 1px dashed var(--el-border-color);
}

.settings-content {
  padding: 4px;
}

.settings-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.settings-card :deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.settings-card :deep(.el-card__body) {
  padding: 20px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
}

.card-header .title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header .title::before {
  content: '';
  width: 3px;
  height: 14px;
  background: var(--el-color-primary);
  border-radius: 2px;
}

.label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 500;
}

.toggle-desc {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.tip-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.w-full {
  width: 100%;
}

.mb-2 { margin-bottom: 8px; }
.mb-4 { margin-bottom: 16px; }
.mb-5 { margin-bottom: 20px; }
.mt-3 { margin-top: 12px; }

@media (max-width: 768px) {
  .card-header {
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
