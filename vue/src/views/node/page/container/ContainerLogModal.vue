<template>
  <el-dialog
    v-model="visible"
    title="容器日志"
    width="900px"
    :before-close="handleClose"
    class="container-log-modal"
  >
    <div class="log-body" v-loading="loading">
      <div v-if="error" class="error-text">
        <el-alert :title="error" type="error" show-icon :closable="false" />
      </div>

      <div v-else class="logs-wrapper">
        <div class="log-toolbar">
          <el-radio-group v-model="activeTab" size="small">
            <el-radio-button label="stdout">标准输出</el-radio-button>
            <el-radio-button label="stderr" :disabled="!stderr">错误输出</el-radio-button>
          </el-radio-group>
          <div class="toolbar-actions">
            <el-button size="small" :icon="Refresh" @click="fetchLogs" :loading="loading">刷新</el-button>
            <el-button size="small" :icon="Download" @click="downloadLogs" :disabled="loading || (!stdout && !stderr)">下载</el-button>
          </div>
        </div>

        <div class="log-content-box">
          <pre v-if="activeTab === 'stdout'" class="log-text">{{ stdout || '无内容' }}</pre>
          <pre v-else class="log-text error-text">{{ stderr || '无内容' }}</pre>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Refresh, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, required: true },
  containerId: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const loading = ref(false)
const error = ref('')
const stdout = ref('')
const stderr = ref('')
const activeTab = ref('stdout')

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.nodeId && props.containerId) {
    fetchLogs()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const fetchLogs = async () => {
  loading.value = true
  error.value = ''
  stdout.value = ''
  stderr.value = ''
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/logs?stdout=true&stderr=true&tail=500&timestamps=true`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (!data.success) throw new Error(data.message || '获取容器日志失败')
    const result = data.data || {}
    stdout.value = result.stdout || ''
    stderr.value = result.stderr || ''
  } catch (err) {
    error.value = err.message || '获取容器日志时发生错误'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

const downloadLogs = () => {
  const content = activeTab.value === 'stdout' ? stdout.value : stderr.value
  const logType = activeTab.value === 'stdout' ? 'stdout' : 'stderr'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `container-${props.containerId}-${logType}-${timestamp}.log`

  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const handleClose = () => {
  if (loading.value) return
  visible.value = false
}
</script>

<style scoped>
.log-body {
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

.logs-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 10px;
}

.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-content-box {
  flex: 1;
  background-color: #1e1e1e;
  border-radius: 4px;
  padding: 10px;
  overflow: auto;
  max-height: 600px;
  min-height: 300px;
  border: 1px solid var(--el-border-color-darker);
}

.log-text {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-text {
  color: #f87171;
}
</style>
