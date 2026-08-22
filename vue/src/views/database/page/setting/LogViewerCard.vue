<template>
  <div class="log-viewer-card">
    <div class="card-header">
      <h3 class="card-title">系统日志</h3>
      <div class="header-actions">
        <el-select
          v-model="tail"
          class="filter-select"
          title="尾部行数"
          :disabled="!nodeId"
        >
          <el-option :value="100" label="最近 100 行" />
          <el-option :value="200" label="最近 200 行" />
          <el-option :value="500" label="最近 500 行" />
          <el-option :value="1000" label="最近 1000 行" />
        </el-select>

        <div class="date-filter">
          <span class="field-label">起始时间</span>
          <el-date-picker
            v-model="since"
            type="datetime"
            placeholder="选择时间"
            value-format="YYYY-MM-DDTHH:mm"
            class="datetime-input"
            :disabled="!nodeId"
          />
        </div>

        <el-switch
          v-model="timestamps"
          active-text="时间戳"
          :disabled="!nodeId"
        />

        <el-button
          type="primary"
          @click="refreshLogs"
          :disabled="!nodeId"
        >
          刷新
        </el-button>
        <el-button
          type="success"
          @click="downloadLogs"
          :disabled="!nodeId || !logLines.length"
        >
          下载
        </el-button>
      </div>
    </div>

    <div class="card-content">
      <div class="log-content">
        <div v-if="logLines.length === 0" class="no-logs">
          <p>暂无日志数据</p>
        </div>
        <div v-else class="log-list">
          <pre>{{ logText }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  nodeId: {
    type: String,
    default: ''
  },
  maxLogs: {
    type: Number,
    default: 100
  }
})

const emit = defineEmits(['download', 'refresh'])

const logLines = ref([])
const tail = ref(500)
const timestamps = ref(true)
const since = ref('')

const logText = computed(() => logLines.value.join('\n'))

const fetchLogs = async () => {
  if (!props.nodeId) {
    logLines.value = []
    return
  }
  try {
    let url = `/api/forward/${props.nodeId}/mysql/admin/logs?tail=${encodeURIComponent(
      tail.value
    )}&timestamps=${timestamps.value ? 'true' : 'false'}`
    if (since.value) {
      const ts = Math.floor(new Date(since.value).getTime() / 1000)
      if (Number.isFinite(ts) && ts > 0) {
        url += `&since=${encodeURIComponent(ts)}`
      }
    }
    const res = await fetch(url)
    const json = await res.json().catch(() => ({}))
    const data = json && json.data ? json.data : {}
    const out = String(data && data.stdout ? data.stdout : '')
    const err = String(data && data.stderr ? data.stderr : '')
    const combined = err ? `${out}\n${err}` : out
    const lines = combined.split('\n').filter((l) => l !== '')
    logLines.value = props.maxLogs > 0 ? lines.slice(-props.maxLogs) : lines
  } catch {
    logLines.value = []
  }
}

const refreshLogs = async () => {
  try {
    await fetchLogs()
    ElMessage.success('日志刷新成功')
    emit('refresh')
  } catch {
    ElMessage.error('日志刷新失败')
    emit('refresh')
  }
}

const downloadLogs = () => {
  const blob = new Blob([logText.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  emit('download')
}

onMounted(() => {
  fetchLogs()
})

watch(
  () => props.nodeId,
  () => {
    fetchLogs()
  }
)

watch(
  [tail, timestamps, since],
  () => {
    fetchLogs()
  }
)
</script>

<style scoped>
.log-viewer-card {
  background: transparent;
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.card-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 160px;
}

.date-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.field-label {
  color: var(--el-text-color-primary);
  font-size: 12px;
}

.datetime-input {
  width: 220px;
}

.card-content {
  padding-top: 12px;
}

.log-content {
  height: 400px;
  overflow-y: auto;
  padding: 16px;
  background: #0a0a0a00;
  border: 1px solid #353636;
  border-radius: 6px;
}

.no-logs {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  font-style: italic;
}

.log-list pre {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .header-actions {
    gap: 8px;
    width: 100%;
  }
}
</style>

