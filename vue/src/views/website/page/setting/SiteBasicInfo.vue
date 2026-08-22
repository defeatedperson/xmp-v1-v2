<template>
  <div class="site-basic-info">
    <div v-if="!site || !site.id" class="no-site-container">
      <el-empty description="请选择站点后查看基础信息" :image-size="120" />
    </div>
    <div v-else class="info-content">
      <el-row :gutter="20">
        <!-- 基础字段 -->
        <el-col :xs="24" :sm="12" :md="8" class="mb-5">
          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span class="title">基础字段</span>
              </div>
            </template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="主域名">
                <span class="mono-value">{{ site.primaryDomain || site.id }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="站点类型">
                <el-tag size="small" :type="typeTagType" effect="dark">{{ typeText }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="备注">
                {{ site.remark || '—' }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <!-- 运行状态 -->
        <el-col :xs="24" :sm="12" :md="8" class="mb-5">
          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header status-header">
                <span class="title">运行状态</span>
                <el-switch
                  v-model="localEnabled"
                  :loading="loading"
                  @change="toggleEnabled"
                  active-text="已启用"
                  inactive-text="已禁用"
                  inline-prompt
                />
              </div>
            </template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="启用状态">
                <el-tag size="small" :type="site.enabled ? 'success' : 'danger'" effect="plain">
                  {{ formatBool(site.enabled) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="协议">
                <el-tag size="small" type="info" effect="plain">{{ site.protocol || 'http' }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="配置文件">
                <span class="mono-value">{{ site.confFile || '—' }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <!-- 路径与时间 -->
        <el-col :xs="24" :sm="12" :md="8" class="mb-5">
          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span class="title">路径与时间</span>
              </div>
            </template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="站点目录">
                <span class="mono-value">{{ site.directory ? `/openresty/${site.directory}` : '—' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">
                {{ formatDate(site.createdAt) }}
              </el-descriptions-item>
              <el-descriptions-item label="更新时间">
                {{ formatDate(site.updatedAt) }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <!-- HTTPS/证书 -->
        <el-col :xs="24" :sm="12" :md="8" class="mb-5">
          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span class="title">HTTPS/证书</span>
              </div>
            </template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="启用 HTTPS">
                <el-tag size="small" :type="config.httpsEnabled ? 'success' : 'info'" effect="plain">
                  {{ formatBool(config.httpsEnabled) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="HTTPS 跳转">
                <el-tag size="small" :type="config.httpsRedirect ? 'warning' : 'info'" effect="plain">
                  {{ formatBool(config.httpsRedirect) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="证书名称">
                <span class="mono-value">{{ config.certName || '—' }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

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

const loading = ref(false)
const localEnabled = ref(props.site?.enabled ?? true)

// Sync localEnabled with site.enabled when site prop changes
watch(
  () => props.site?.enabled,
  (newEnabled) => {
    if (newEnabled !== undefined && newEnabled !== null) {
      localEnabled.value = newEnabled
    }
  }
)

const toggleEnabled = async (newValue) => {
  if (!props.nodeId) {
    ElMessage.error('节点ID缺失')
    localEnabled.value = !newValue // revert the toggle
    return
  }

  if (!props.site?.id) {
    ElMessage.error('站点ID缺失')
    localEnabled.value = !newValue // revert the toggle
    return
  }

  try {
    const action = newValue ? '启用' : '禁用'
    await ElMessageBox.confirm(
      `确定要${action}站点 "${props.site.name || props.site.id}" 吗？`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    loading.value = true

    const domain = props.site.primaryDomain || props.site.id
    const body = {
      name: props.site.name || '',
      type: props.site.type || 'static',
      remark: props.site.remark || '',
      enabled: newValue,
      httpsEnabled: props.site.protocol === 'https',
      httpsRedirect: props.site.config?.httpsRedirect || false,
      certName: props.site.config?.certName || '',
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

    localEnabled.value = newValue
    ElMessage.success(`${action}成功`)

    emit('refresh')
  } catch (error) {
    if (error !== 'cancel') { // ElMessageBox returns 'cancel' when user cancels
      const msg = error?.message || `站点${newValue ? '启用' : '禁用'}失败`
      ElMessage.error(msg)
    }
    // Revert the toggle to the original state
    localEnabled.value = !newValue
  } finally {
    loading.value = false
  }
}

const config = computed(() => {
  const raw = props.site && props.site.config ? props.site.config : {}
  return {
    httpsEnabled: !!raw.httpsEnabled,
    httpsRedirect: !!raw.httpsRedirect,
    certName: raw.certName || '',
  }
})

const typeText = computed(() => {
  const t = props.site && props.site.type ? props.site.type : ''
  if (t === 'php') return 'PHP'
  if (t === 'proxy') return '反向代理'
  if (t === 'static') return '静态'
  return t || '未知'
})

const typeTagType = computed(() => {
  const t = props.site && props.site.type ? props.site.type : ''
  if (t === 'php') return 'success'
  if (t === 'proxy') return 'warning'
  if (t === 'static') return 'info'
  return ''
})

const formatBool = (v) => (v ? '是' : '否')

const formatDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped>
.site-basic-info {
  margin-top: 16px;
}

.no-site-container {
  padding: 40px;
  background: var(--el-fill-color-blank);
  border-radius: 12px;
  border: 1px dashed var(--el-border-color);
}

.info-content {
  padding: 4px;
}

.info-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  height: 100%;
}

.card-header {
  display: flex;
  align-items: center;
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

.status-header {
  justify-content: space-between;
  width: 100%;
}

.mono-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  word-break: break-all;
  color: var(--el-text-color-regular);
}

.mb-5 {
  margin-bottom: 20px;
}

:deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-card__body) {
  padding: 16px;
}

:deep(.el-descriptions__label) {
  width: 100px;
  background-color: var(--el-fill-color-light) !important;
  color: var(--el-text-color-secondary) !important;
}

:deep(.el-descriptions__content) {
  color: var(--el-text-color-primary) !important;
}

@media (max-width: 768px) {
  .card-header {
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>

