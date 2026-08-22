<template>
  <div class="site-type-settings">
    <div v-if="!site || !site.id" class="no-site-container">
      <el-empty description="请选择站点后查看类型与环境设置" :image-size="120" />
    </div>
    <div v-else class="settings-content">
      <el-row :gutter="20">
        <!-- 站点类型 -->
        <el-col :xs="24" :sm="24" :md="12" class="mb-5">
          <el-card shadow="never" class="settings-card">
            <template #header>
              <div class="card-header">
                <span class="title">站点类型</span>
              </div>
            </template>
            <div class="card-body">
              <div class="type-options">
                <div
                  v-for="option in typeOptions"
                  :key="option.value"
                  class="type-option"
                  :class="{ active: localType === option.value }"
                  @click="selectType(option.value)"
                >
                  <div class="type-icon">
                    <el-icon><component :is="option.icon" /></el-icon>
                  </div>
                  <div class="type-info">
                    <div class="type-name">{{ option.label }}</div>
                    <div class="type-desc">{{ option.description }}</div>
                  </div>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- 环境配置 -->
        <el-col :xs="24" :sm="24" :md="12" class="mb-5">
          <el-card shadow="never" class="settings-card">
            <template #header>
              <div class="card-header">
                <span class="title">环境配置</span>
                <div class="header-actions">
                  <el-button
                    v-if="hasChanges"
                    size="small"
                    :disabled="loading"
                    @click="resetChanges"
                  >
                    取消
                  </el-button>
                  <el-button
                    type="primary"
                    size="small"
                    :loading="loading"
                    :disabled="!hasChanges"
                    @click="saveSettings"
                  >
                    保存配置
                  </el-button>
                </div>
              </div>
            </template>
            <div class="card-body">
              <div v-if="localType === 'static'" class="static-info">
                <el-alert
                  title="静态站点"
                  type="info"
                  description="静态站点无需额外配置，系统将自动处理 HTML、CSS、JavaScript 等静态文件。"
                  :closable="false"
                  show-icon
                />
              </div>

              <el-form v-if="localType === 'php'" label-position="top">
                <el-form-item label="PHP 环境">
                  <div class="input-group">
                    <el-select
                      v-model="selectedPhpPort"
                      :placeholder="phpLoading ? '正在加载 PHP 容器...' : (phpContainers.length === 0 ? '未找到正在运行的 PHP 容器' : '请选择正在运行的 PHP 容器')"
                      style="width: 100%"
                    >
                      <el-option
                        v-for="env in phpContainers"
                        :key="env.name"
                        :label="`${env.name} (端口: ${env.publicPort})`"
                        :value="String(env.publicPort)"
                      />
                    </el-select>
                    <el-button
                      :loading="phpLoading"
                      @click="loadPhpContainers"
                      title="刷新 PHP 容器列表"
                    >
                      <el-icon v-if="!phpLoading"><Refresh /></el-icon>
                    </el-button>
                  </div>
                </el-form-item>
                <el-alert
                  class="tip-alert"
                  title="PHP-FPM 说明"
                  type="info"
                  description="选择正在运行的 PHP 容器，系统将自动配置对应的 PHP-FPM 端口。"
                  :closable="false"
                />
              </el-form>

              <el-form v-if="localType === 'proxy'" label-position="top">
                <div class="proxy-form-row">
                  <el-form-item label="代理协议" style="flex: 1">
                    <el-select v-model="proxyProtocol" :disabled="loading" style="width: 100%">
                      <el-option label="HTTP" value="http" />
                      <el-option label="HTTPS" value="https" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="代理地址" style="flex: 2">
                    <el-input v-model="proxyHost" placeholder="例如: example.com 或 127.0.0.1（可带路径）" />
                  </el-form-item>
                  <el-form-item label="代理端口" style="flex: 1">
                    <el-input
                      v-model="proxyPort"
                      type="number"
                      placeholder="例如: 80"
                      @input="proxyPortAuto = false"
                    />
                  </el-form-item>
                </div>
                <el-alert
                  class="tip-alert"
                  title="反向代理说明"
                  type="info"
                  description="将所有请求代理到指定的目标服务器。支持 HTTP 和 HTTPS 协议。"
                  :closable="false"
                />
              </el-form>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Document, Connection, Switch } from '@element-plus/icons-vue'
import { fetchPhpContainers } from '@/utils/phpContainers'

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
const localType = ref('static')
const proxyProtocol = ref('http')
const proxyHost = ref('')
const proxyPort = ref('80')
const proxyPortAuto = ref(true)
const phpContainers = ref([])
const phpLoading = ref(false)
const selectedPhpPort = ref('')

const getDefaultProxyPort = (protocol) => (protocol === 'https' ? 443 : 80)

const validateProxyAddress = (value) => {
  const v = String(value || '').trim()
  if (!v) throw new Error('请输入代理地址')
  if (v.includes('://')) throw new Error('代理地址无需包含协议')
  if (/[\s\\]/.test(v)) throw new Error('代理地址格式无效')
  if (/[\r\n;]/.test(v)) throw new Error('代理地址格式无效')
  const cutIndex = v.search(/[/?#]/)
  const hostPart = cutIndex === -1 ? v : v.slice(0, cutIndex)
  if (!hostPart) throw new Error('代理地址格式无效')
  if (hostPart.includes(':')) throw new Error('代理地址请勿包含端口')
  return { hostPart, suffix: cutIndex === -1 ? '' : v.slice(cutIndex) }
}

const validateProxyPort = (value) => {
  const n = parseInt(String(value || ''), 10)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('代理端口无效')
  return n
}

const buildProxyTarget = () => {
  const protocol = proxyProtocol.value || 'http'
  const { hostPart, suffix } = validateProxyAddress(proxyHost.value)
  const portValue = validateProxyPort(proxyPort.value)
  return `${protocol}://${hostPart}:${portValue}${suffix}`
}

const parseProxyTarget = (raw) => {
  const v = String(raw || '').trim()
  if (!v) {
    proxyProtocol.value = 'http'
    proxyHost.value = ''
    proxyPortAuto.value = true
    proxyPort.value = String(getDefaultProxyPort('http'))
    return
  }
  const hasScheme = /^https?:\/\//i.test(v)
  if (!hasScheme) {
    proxyProtocol.value = 'http'
    proxyHost.value = v
    proxyPortAuto.value = true
    proxyPort.value = String(getDefaultProxyPort('http'))
    return
  }
  let url = null
  try {
    url = new URL(v)
  } catch {
    proxyProtocol.value = 'http'
    proxyHost.value = v
    proxyPortAuto.value = true
    proxyPort.value = String(getDefaultProxyPort('http'))
    return
  }
  proxyProtocol.value = url.protocol === 'https:' ? 'https' : 'http'
  proxyHost.value = (url.hostname || '') + (url.pathname || '') + (url.search || '') + (url.hash || '')
  proxyPortAuto.value = true
  proxyPort.value = String(url.port ? parseInt(url.port, 10) : getDefaultProxyPort(proxyProtocol.value))
}

const typeOptions = [
  {
    value: 'static',
    label: '静态站点',
    description: '适用于 HTML、CSS、JavaScript 等静态文件',
    icon: Document
  },
  {
    value: 'php',
    label: 'PHP 应用',
    description: '适用于 PHP 网站和应用，需要 PHP-FPM 支持',
    icon: Connection
  },
  {
    value: 'proxy',
    label: '反向代理',
    description: '将请求代理到其他服务器',
    icon: Switch
  }
]

const hasChanges = computed(() => {
  if (!props.site) return false

  const currentType = props.site.type || 'static'
  const currentConfig = props.site.config || {}
  const currentPhpPort = currentConfig.phpFastcgiPort || null
  const currentProxyTarget = currentConfig.proxyTarget || ''

  const selectedPort = selectedPhpPort.value ? parseInt(selectedPhpPort.value, 10) : null
  let nextProxyTarget = ''
  if (localType.value === 'proxy') {
    try {
      nextProxyTarget = buildProxyTarget()
    } catch {
      nextProxyTarget = ''
    }
  }

  return (
    localType.value !== currentType ||
    (localType.value === 'php' && selectedPort !== currentPhpPort) ||
    (localType.value === 'proxy' && nextProxyTarget !== currentProxyTarget)
  )
})

const selectType = (type) => {
  localType.value = type
}

const loadPhpContainers = async () => {
  if (!props.nodeId) {
    phpContainers.value = []
    return
  }
  if (phpLoading.value) return
  phpLoading.value = true
  try {
    const list = await fetchPhpContainers(props.nodeId)
    phpContainers.value = list.filter(
      (item) => item && item.state === 'running' && item.publicPort,
    )
  } catch {
    phpContainers.value = []
  } finally {
    phpLoading.value = false
  }
}

const resetChanges = () => {
  if (!props.site) return

  localType.value = props.site.type || 'static'
  const config = props.site.config || {}
  parseProxyTarget(config.proxyTarget || '')
  selectedPhpPort.value = config.phpFastcgiPort ? String(config.phpFastcgiPort) : ''

  if (localType.value === 'php') {
    loadPhpContainers()
  }
}

const saveSettings = async () => {
  if (!props.nodeId) {
    ElMessage.error('节点ID缺失')
    return
  }

  if (!props.site?.id) {
    ElMessage.error('站点ID缺失')
    return
  }

  // 验证必填字段
  if (localType.value === 'php') {
    const port = parseInt(selectedPhpPort.value, 10)
    if (!port || port <= 0 || port > 65535) {
      ElMessage.error('请选择有效的 PHP 环境')
      return
    }
  }

  let proxyTargetValue = ''
  if (localType.value === 'proxy') {
    try {
      proxyTargetValue = buildProxyTarget()
    } catch (e) {
      ElMessage.error(e.message || '代理配置无效')
      return
    }
  }

  try {
    await ElMessageBox.confirm(
      `确定要将站点类型修改为 "${getTypeLabel(localType.value)}" 吗？`,
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
      type: localType.value,
      ...(localType.value === 'php' && { phpFastcgiPort: parseInt(selectedPhpPort.value, 10) }),
      ...(localType.value === 'proxy' && { proxyTarget: proxyTargetValue }),
      // 保留其他配置
      remark: props.site.remark || '',
      enabled: props.site.enabled !== false,
      httpsEnabled: props.site.protocol === 'https',
      httpsRedirect: props.site.config?.httpsRedirect || false,
      certName: props.site.config?.certName || '',
      accessLogEnabled: props.site.config?.accessLogEnabled !== false,
      errorLogEnabled: props.site.config?.errorLogEnabled !== false,
      http2Enabled: props.site.config?.http2Enabled || false,
      workDir: props.site.config?.workDir || '',
      serverNames: props.site.config?.serverNames || [],
      domains: props.site.config?.domains || [],
      serverName: props.site.config?.serverName || '',
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
    ElMessage.success('站点类型修改成功')
    if (reload && reload.success === false) {
      const detail = reload.message ? `：${reload.message}` : ''
      ElMessage.warning(`配置已保存，但重载失败${detail}`)
    }
    emit('refresh')
  } catch (error) {
    if (error !== 'cancel') {
      const msg = error?.message || '站点类型修改失败'
      ElMessage.error(msg)
    }
  } finally {
    loading.value = false
  }
}

const getTypeLabel = (type) => {
  const option = typeOptions.find(opt => opt.value === type)
  return option ? option.label : type
}

// 初始化数据
watch(
  () => props.site,
  (newSite) => {
    if (newSite) {
      resetChanges()
    }
  },
  { immediate: true }
)

watch(
  () => localType.value,
  async (v, oldV) => {
    if (v === 'php') {
      // 只有在手动切换类型时才清空端口选择
      // 如果当前类型与站点原始类型不同，说明是用户手动切换的，此时清空端口选择
      if (oldV !== undefined && v !== (props.site?.type || 'static')) {
        selectedPhpPort.value = ''
      }
      await loadPhpContainers()
    }
    if (v === 'proxy') {
      if (!proxyProtocol.value) proxyProtocol.value = 'http'
      if (proxyPortAuto.value) {
        proxyPort.value = String(getDefaultProxyPort(proxyProtocol.value))
      }
    }
  },
)

watch(
  () => props.nodeId,
  (newId) => {
    if (newId && localType.value === 'php') {
      loadPhpContainers()
    }
  }
)

watch(
  () => proxyProtocol.value,
  (v) => {
    if (localType.value !== 'proxy') return
    if (proxyPortAuto.value) {
      proxyPort.value = String(getDefaultProxyPort(v))
    }
  },
)
</script>

<style scoped>
.site-type-settings {
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

.header-actions {
  display: flex;
  gap: 8px;
}

.type-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.type-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-light);
  cursor: pointer;
  transition: all 0.25s ease;
}

.type-option:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.type-option.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

.type-icon {
  font-size: 20px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-bg-color);
  border-radius: 8px;
  color: var(--el-color-primary);
}

.type-info {
  flex: 1;
}

.type-name {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.type-desc {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.static-info {
  margin-bottom: 20px;
}

.input-group {
  display: flex;
  gap: 8px;
  width: 100%;
}

.proxy-form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.tip-alert {
  margin-top: 16px;
}

.mb-5 {
  margin-bottom: 20px;
}

:deep(.el-form-item__label) {
  color: var(--el-text-color-secondary) !important;
  font-size: 13px !important;
  margin-bottom: 4px !important;
}

@media (max-width: 768px) {
  .card-header {
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
  }

  .proxy-form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
