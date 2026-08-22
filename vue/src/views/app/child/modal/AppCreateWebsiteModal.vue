<template>
  <el-dialog
    v-model="visibleModel"
    title="为容器创建网站"
    width="500px"
    :close-on-click-modal="false"
    :before-close="handleClose"
    destroy-on-close
  >
    <div v-if="error" class="error-alert">
      <el-alert :title="error" type="error" show-icon :closable="false" />
    </div>

    <el-alert
      title="将为此容器创建反向代理网站"
      type="info"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <el-form label-position="top">
      <el-form-item label="主域名" required>
        <el-input
          v-model="primaryDomain"
          placeholder="请填写主域名，例如: example.com"
          :disabled="loading"
        />
      </el-form-item>

      <div class="proxy-row">
        <el-form-item label="协议" class="proxy-protocol">
          <el-select v-model="proxyProtocol" :disabled="loading">
            <el-option label="HTTP" value="http" />
            <el-option label="HTTPS" value="https" />
          </el-select>
        </el-form-item>

        <el-form-item label="端口" required class="proxy-port">
          <el-select v-model="proxyPort" :disabled="loading" placeholder="请选择端口">
            <el-option
              v-for="port in availablePorts"
              :key="port.value"
              :label="port.label"
              :value="port.value"
            />
          </el-select>
        </el-form-item>
      </div>

      <el-form-item label="备注">
        <el-input
          v-model="remark"
          placeholder="备注信息，可选"
          :disabled="loading"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button :disabled="loading" @click="handleClose">取消</el-button>
        <el-button type="primary" :loading="loading" @click="handleSubmit">
          创建
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { toAsciiDomain } from '@/utils/domain'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
  containerId: { type: String, default: '' },
  containerName: { type: String, default: '' },
  containerPorts: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'created', 'update:visible'])

const visibleModel = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const primaryDomain = ref('')
const proxyProtocol = ref('http')
const proxyHost = ref('127.0.0.1')
const proxyPort = ref('')
const remark = ref('')
const loading = ref(false)
const error = ref('')

const availablePorts = computed(() => {
  if (!props.containerPorts || props.containerPorts.length === 0) return []

  const uniquePorts = new Map()
  props.containerPorts.forEach(port => {
    if (port.PublicPort && !uniquePorts.has(port.PublicPort)) {
      uniquePorts.set(port.PublicPort, {
        value: String(port.PublicPort),
        label: `${port.PublicPort} (${port.Type})`
      })
    }
  })

  return Array.from(uniquePorts.values())
})

const validateProxyAddress = (value) => {
  const v = String(value || '').trim()
  if (!v) throw new Error('代理地址无效')
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

const assertSafeDomain = (value) => {
  if (typeof value !== 'string' || !value) throw new Error('主域名不能为空')
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) throw new Error('主域名仅允许字母/数字/点/中划线')
  return value
}

const handleClose = () => {
  if (loading.value) return
  emit('close')
}

const handleSubmit = async () => {
  if (!props.nodeId) {
    error.value = '请选择节点'
    return
  }
  if (!primaryDomain.value) {
    error.value = '请填写主域名'
    return
  }
  if (!proxyPort.value) {
    error.value = '请选择代理端口'
    return
  }

  let proxyTargetValue = ''
  try {
    proxyTargetValue = buildProxyTarget()
  } catch (e) {
    error.value = e.message || '代理配置无效'
    return
  }

  let asciiPrimary = ''
  try {
    asciiPrimary = toAsciiDomain(primaryDomain.value)
    assertSafeDomain(asciiPrimary)
  } catch (e) {
    error.value = e.message || '主域名格式无效'
    return
  }

  try {
    loading.value = true
    error.value = ''
    const payload = {
      primaryDomain: asciiPrimary,
      type: 'proxy',
      proxyTarget: proxyTargetValue,
      remark: remark.value
    }
    const resp = await fetch(`/api/forward/${props.nodeId}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok) {
      error.value = result && result.message ? result.message : '创建失败'
      return
    }
    if (!result || !result.success) {
      error.value = result && result.message ? result.message : '创建失败'
      return
    }
    emit('created', result.data)
    emit('close')
  } catch {
    error.value = '创建失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}

.mb-4 {
  margin-bottom: 16px;
}

.proxy-row {
  display: flex;
  gap: 16px;
}

.proxy-protocol {
  flex: 0 0 120px;
}

.proxy-port {
  flex: 1;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 4px;
}

:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>
