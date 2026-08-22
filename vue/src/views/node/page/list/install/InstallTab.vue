<template>
  <div class="install-tab">
    <div class="node-info">
      <div class="info-content">
        <div class="info-row">
          <span class="info-label">节点类型：</span>
          <span class="info-value">{{ nodeTypeText }}</span>
          <span class="info-tip" v-if="nodeType !== 1">（部分设置无法生效）</span>
        </div>
        <div class="info-row">
          <span class="info-label">端口：</span>
          <span class="info-value">{{ nodePort }}</span>
          <span class="info-tip">(记得设置服务器安全组 , 开放端口)</span>
        </div>
      </div>
    </div>

    <el-divider />

    <el-form label-width="130px" v-if="nodeType === 1">
      <el-form-item label="中国大陆服务器">
        <el-switch
          v-model="form.isMainlandChina"
        />
        <span class="form-tip">{{ form.isMainlandChina ? '需手动安装Docker' : '自动安装Docker' }}</span>
      </el-form-item>

      <div class="tip-box warning" v-if="form.isMainlandChina">
        <el-icon><WarningFilled /></el-icon>
        <span>此地区无法自动安装Docker，请先手动安装再执行安装命令。</span>
        <div class="tip-actions">
          <el-button type="warning" size="small" @click="copyDockerInstallCommand">
            复制 Docker 安装命令
          </el-button>
        </div>
      </div>
    </el-form>

    <div class="action-section">
      <div class="action-steps">
        <div class="step" :class="{ active: !certData.caCert, completed: certData.caCert }">
          <span class="step-num">1</span>
          <span class="step-text">生成证书</span>
          <el-button type="primary" size="small" @click="generateCert" :loading="loading">
            {{ certData.caCert ? '已生成' : '生成证书' }}
          </el-button>
        </div>
        <div class="step-arrow">→</div>
        <div class="step" :class="{ active: certData.caCert }">
          <span class="step-num">2</span>
          <span class="step-text">复制安装命令</span>
          <el-button type="primary" size="small" :disabled="!certData.caCert" @click="copyInstallCommand">
            复制
          </el-button>
        </div>
      </div>
    </div>

    <el-collapse v-model="activeCollapse">
      <el-collapse-item title="高级选项" name="advanced">
        <el-form label-width="120px">
          <el-form-item label="安装目录">
            <el-switch v-model="form.customInstallDir" />
            <span class="form-tip">{{ form.customInstallDir ? form.installDir : '默认 /opt/xmp' }}</span>
          </el-form-item>

          <el-form-item label="安装目录" v-if="form.customInstallDir">
            <el-input
              v-model="form.installDir"
              placeholder="/opt/xmp"
              style="width: 200px"
            />
          </el-form-item>

          <el-form-item label="日志分割" v-if="nodeType === 1">
            <el-switch v-model="form.dockerLogSplit" />
            <span class="form-tip">限制 Docker 日志大小</span>
          </el-form-item>

          <el-form-item label="防火墙端口">
            <el-switch v-model="form.firewallOpen" />
            <span class="form-tip">自动放行 {{ nodePort }} 端口</span>
          </el-form-item>
        </el-form>
      </el-collapse-item>
    </el-collapse>

    <div class="command-tip">
      <el-icon><InfoFilled /></el-icon>
      <span>安装命令很长（包含证书信息），这是正常现象，请勿感到意外。</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { WarningFilled, InfoFilled } from '@element-plus/icons-vue'

const props = defineProps({
  node: { type: Object, default: () => ({}) },
  modelValue: { type: Boolean, default: false }
})

const loading = ref(false)
const activeCollapse = ref([])

const nodeType = computed(() => parseInt(props.node?.type) || 1)

const nodeTypeText = computed(() => {
  switch (nodeType.value) {
    case 1: return '通用被控'
    case 2: return '仅监控'
    case 3: return 'xcc套件'
    default: return '未知类型'
  }
})

const installScriptUrl = computed(() => {
  switch (nodeType.value) {
    case 2: return 'https://dl.xmpanel.cn/sh2/monitor/install.sh'
    case 3: return 'https://dl.xmpanel.cn/sh2/xcc/install.sh'
    default: return 'https://dl.xmpanel.cn/sh2/install.sh'
  }
})

const manualInstallCommand = computed(() => `bash <(curl -sSL ${installScriptUrl.value})`)

const form = reactive({
  isMainlandChina: false,
  customInstallDir: false,
  installDir: '/opt/xmp',
  dockerLogSplit: true,
  firewallOpen: true
})

const certData = reactive({
  nodeId: '',
  hostname: '',
  caCert: '',
  nodeCert: '',
  nodeKey: ''
})

const nodePort = computed(() => {
  const address = props.node?.address || ''
  const match = address.match(/:(\d{1,5})$/)
  return match ? match[1] : '3008'
})

watch(() => props.modelValue, (val) => {
  if (val) {
    initForm()
  }
})

const initForm = () => {
  form.isMainlandChina = false
  form.customInstallDir = false
  form.installDir = '/opt/xmp'
  form.dockerLogSplit = true
  form.firewallOpen = true
  activeCollapse.value = []

  certData.nodeId = ''
  certData.hostname = ''
  certData.caCert = ''
  certData.nodeCert = ''
  certData.nodeKey = ''
}

const encodeBase64 = (text) => {
  try {
    return btoa(unescape(encodeURIComponent(String(text || ''))))
  } catch {
    return ''
  }
}

const generateCert = async () => {
  if (!props.node?.id) {
    ElMessage.warning('节点信息不完整')
    return
  }

  loading.value = true
  try {
    const response = await fetch(`/api/node/${props.node.id}/cert`, {
      method: 'POST'
    })
    const data = await response.json()

    if (data.success) {
      certData.nodeId = data.data.nodeId
      certData.hostname = data.data.hostname
      certData.caCert = data.data.caCert
      certData.nodeCert = data.data.nodeCert
      certData.nodeKey = data.data.nodeKey
      ElMessage.success('证书生成成功')
    } else {
      ElMessage.error(data.message || '证书生成失败')
    }
  } catch {
    ElMessage.error('网络请求失败')
  } finally {
    loading.value = false
  }
}

const buildCommand = () => {
  const port = nodePort.value
  const caB64 = encodeBase64(certData.caCert)
  const certB64 = encodeBase64(certData.nodeCert)
  const keyB64 = encodeBase64(certData.nodeKey)

  if (!port || !caB64 || !certB64 || !keyB64) return ''

  const options = []

  options.push(`NODE_ID=${certData.nodeId}`)
  options.push(`PORT=${port}`)

  if (form.customInstallDir) {
    options.push(`INSTALL_DIR=${form.installDir}`)
  }

  if (nodeType.value === 1) {
    options.push(form.isMainlandChina ? 'DOCKER_MIRROR=y' : 'DOCKER_MIRROR=n')
    options.push(form.isMainlandChina ? 'AUTO_INSTALL_DOCKER=n' : 'AUTO_INSTALL_DOCKER=y')
    options.push(form.dockerLogSplit ? 'DOCKER_LOG_SPLIT=y' : 'DOCKER_LOG_SPLIT=n')
  }

  options.push(form.firewallOpen ? 'FIREWALL_OPEN=y' : 'FIREWALL_OPEN=n')

  options.push(`CERT_PEM_B64='${certB64}'`)
  options.push(`CERT_KEY_B64='${keyB64}'`)
  options.push(`CA_PEM_B64='${caB64}'`)

  return `${options.join(' ')} ${manualInstallCommand.value}`
}

const copyToClipboard = async (text, successMsg = '复制成功') => {
  if (!text) {
    ElMessage.warning('内容为空')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(successMsg)
  } catch {
    ElMessage.error('复制失败')
  }
}

const copyDockerInstallCommand = () => {
  copyToClipboard('bash <(curl -sSL https://linuxmirrors.cn/docker.sh)', 'Docker 安装命令已复制')
}

const copyInstallCommand = () => {
  if (!certData.caCert) {
    ElMessage.warning('请先生成证书')
    return
  }
  const cmd = buildCommand()
  copyToClipboard(cmd, '安装命令已复制')
}

defineExpose({
  certData
})
</script>

<style scoped>
.install-tab {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.node-info {
  padding: 12px 16px;
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
}

.info-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.info-content {
  font-size: 14px;
}

.info-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
}

.info-row + .info-row {
  margin-top: 4px;
}

.info-label {
  font-weight: 500;
}

.info-value {
  color: var(--el-color-primary);
  font-weight: 500;
}

.info-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
}

.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tip-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  margin: 0 10px;
}

.tip-box.warning {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}

.tip-box .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
}


.action-section {
  padding: 16px 0;
}

.action-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
}

.action-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.step.active {
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
}

.step.completed {
  background: var(--el-color-success-light-9);
  border: 1px solid var(--el-color-success-light-5);
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: white;
  font-size: 12px;
  font-weight: 500;
}

.step.completed .step-num {
  background: var(--el-color-success);
}

.step-text {
  font-size: 14px;
}

.step-arrow {
  font-size: 20px;
  color: var(--el-text-color-secondary);
}

.command-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--el-color-info-light-9);
  border-radius: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-top: 16px;
}

.command-tip .el-icon {
  color: var(--el-color-info);
  flex-shrink: 0;
}

:deep(.el-divider) {
  margin: 16px 0;
}

:deep(.el-collapse-item__header) {
  font-weight: 500;
}

:deep(.el-form-item) {
  margin-bottom: 12px;
}
</style>
