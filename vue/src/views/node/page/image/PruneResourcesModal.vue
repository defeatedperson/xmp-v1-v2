<template>
  <el-dialog
    v-model="visible"
    title="Docker 构建缓存清理"
    width="600px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleClose"
  >
    <div class="modal-body">
      <el-alert
        title="注意"
        type="info"
        show-icon
        :closable="false"
        class="mb-4"
      >
        <template #default>
          <div class="info-content">
            <p>此功能将清理 Docker 构建过程中产生的缓存文件，释放磁盘空间。</p>
            <p>清理操作是安全的，不会影响已存在的镜像、容器或其他资源。</p>
          </div>
        </template>
      </el-alert>

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="mb-4"
      />

      <div v-if="pruneLogs.length > 0" class="logs-container">
        <div class="logs-header">清理日志</div>
        <div class="logs-content" ref="logsContainer">
          <div v-for="(log, index) in pruneLogs" :key="index" class="log-entry">
            {{ log }}
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose" :disabled="loading">取消</el-button>
        <el-button type="primary" @click="pruneResources" :loading="loading">
          {{ loading ? '清理中...' : '开始清理' }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, nextTick, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  nodeId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'success'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const loading = ref(false)
const error = ref('')
const pruneLogs = ref([])
const logsContainer = ref(null)

const handleClose = () => {
  if (!loading.value) {
    visible.value = false
  }
}

const addLog = (message) => {
  const timestamp = new Date().toLocaleTimeString()
  pruneLogs.value.push(`[${timestamp}] ${message}`)

  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight
    }
  })
}

const pruneResources = async () => {
  loading.value = true
  error.value = ''
  pruneLogs.value = []

  try {
    addLog('开始清理 Docker 构建缓存...')

    const response = await fetch(`/api/forward/${props.nodeId}/docker/prune`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    if (data.success) {
      const { taskId } = data.data || {}
      if (taskId) {
        addLog(`任务已创建，ID: ${taskId}`)
        addLog('任务已提交，详细信息请前往任务中心查看')
      } else {
        addLog('任务已创建')
      }
      
      loading.value = false
      setTimeout(() => {
        emit('success')
        visible.value = false
      }, 1500)
    } else {
      throw new Error(data.message || '构建缓存清理失败')
    }
  } catch (err) {
    error.value = err.message || '执行构建缓存清理时发生错误'
    addLog(`错误: ${error.value}`)
    loading.value = false
  }
}
</script>

<style scoped>
.mb-4 {
  margin-bottom: 16px;
}

.info-content p {
  margin: 4px 0;
}

.logs-container {
  margin-top: 20px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-darker);
}

.logs-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color);
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.logs-content {
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #cbd5e1;
}

.log-entry {
  margin-bottom: 4px;
  word-break: break-all;
}

.log-entry:last-child {
  margin-bottom: 0;
}
</style>
