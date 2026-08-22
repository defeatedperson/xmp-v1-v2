<template>
  <div class="update-tab">
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
        </div>
      </div>
    </div>

    <el-divider />

    <el-form label-width="130px">
      <el-form-item label="重新生成证书">
        <el-switch v-model="form.regenerateCert" />
        <span class="form-tip">更新证书需要重启节点服务</span>
      </el-form-item>

      <el-form-item label="配置镜像加速" v-if="nodeType === 1">
        <el-switch v-model="form.dockerMirror" />
        <span class="form-tip">解决 Docker 镜像拉取慢的问题</span>
      </el-form-item>
    </el-form>

    <div class="action-section" v-if="form.regenerateCert">
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
          <span class="step-text">复制更新命令</span>
          <el-button type="primary" size="small" :disabled="!certData.caCert" @click="copyUpdateCommand">
            复制
          </el-button>
        </div>
      </div>
    </div>

    <div class="action-section" v-else>
      <el-button type="primary" @click="copyUpdateCommand">
        复制更新命令
      </el-button>
    </div>

    <div class="command-tip">
      <el-icon><InfoFilled /></el-icon>
      <span>更新命令可能包含证书信息，也许会很长，请勿感到意外，是正常的。</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'

const props = defineProps({
  node: { type: Object, default: () => ({}) },
  modelValue: { type: Boolean, default: false }
})

const loading = ref(false)

const nodeType = computed(() => parseInt(props.node?.type) || 1)

const nodeTypeText = computed(() => {
  switch (nodeType.value) {
    case 1: return '通用被控'
    case 2: return '仅监控'
    case 3: return 'xcc套件'
    default: return '未知类型'
  }
})

const updateScriptUrl = computed(() => {
  switch (nodeType.value) {
    case 2: return 'https://dl.xmpanel.cn/sh2/monitor/update.sh'
    case 3: return 'https://dl.xmpanel.cn/sh2/xcc/update.sh'
    default: return 'https://dl.xmpanel.cn/sh2/update.sh'
  }
})

const updateCommand = computed(() => `bash <(curl -sSL ${updateScriptUrl.value})`)

const form = reactive({
  regenerateCert: false,
  dockerMirror: false
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
  return match ? match[1] : ''
})

watch(() => props.modelValue, (val) => {
  if (val) {
    initForm()
  }
})

const initForm = () => {
  form.regenerateCert = false
  form.dockerMirror = false

  certData.nodeId = ''
  certData.hostname = ''
  certData.caCert = ''
  certData.nodeCert = ''
  certData.nodeKey = ''
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

const encodeBase64 = (text) => {
  try {
    return btoa(unescape(encodeURIComponent(String(text || ''))))
  } catch {
    return ''
  }
}

const buildCommand = () => {
  const port = nodePort.value
  if (!port) return ''

  const caB64 = encodeBase64(certData.caCert)
  const certB64 = encodeBase64(certData.nodeCert)
  const keyB64 = encodeBase64(certData.nodeKey)

  const options = []

  if (form.regenerateCert) {
    options.push(`PORT=${port}`)
    if (caB64) {
      options.push(`CA_PEM_B64='${caB64}'`)
    }
    if (certB64) {
      options.push(`CERT_PEM_B64='${certB64}'`)
    }
    if (keyB64) {
      options.push(`CERT_KEY_B64='${keyB64}'`)
    }
  }

  if (nodeType.value === 1 && form.dockerMirror) {
    options.push('DOCKER_MIRROR=y')
  }

  return `${options.join(' ')} ${updateCommand.value}`.trim()
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

const copyUpdateCommand = () => {
  const cmd = buildCommand()
  copyToClipboard(cmd, '更新命令已复制')
}

defineExpose({
  certData
})
</script>

<style scoped>
.update-tab {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.node-info {
  padding: 12px 16px;
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
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

.action-section {
  padding: 16px 0;
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

:deep(.el-form-item) {
  margin-bottom: 12px;
}
</style>
