<template>
  <el-dialog
    v-model="visible"
    title="拉取镜像"
    width="600px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleClose"
  >
    <div class="modal-body">
      <el-form label-position="top">
        <el-form-item label="镜像名称">
          <el-input
            v-model="imageName"
            placeholder="例如: nginx:latest 或 registry.example.com/myimage:tag"
            :disabled="loading"
            @keyup.enter="pullImage"
          />
          <div class="help-text">
            可以是公共镜像（如 nginx:latest）或私有仓库镜像（如 registry.example.com/myimage:tag，需要提前添加私有仓库）
          </div>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="mb-4"
      />

      <div v-if="pullLogs.length > 0" class="logs-container">
        <div class="logs-header">拉取日志</div>
        <div class="logs-content" ref="logsContainer">
          <div v-for="(log, index) in pullLogs" :key="index" class="log-entry">
            {{ log }}
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose" :disabled="loading">取消</el-button>
        <el-button type="primary" @click="pullImage" :loading="loading" :disabled="!imageName">
          {{ loading ? '拉取中...' : '拉取镜像' }}
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

const imageName = ref('')
const loading = ref(false)
const error = ref('')
const pullLogs = ref([])
const logsContainer = ref(null)

const handleClose = () => {
  if (!loading.value) {
    visible.value = false
  }
}

const addLog = (message) => {
  const timestamp = new Date().toLocaleTimeString()
  pullLogs.value.push(`[${timestamp}] ${message}`)

  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight
    }
  })
}

const pullImage = async () => {
  if (!imageName.value.trim()) {
    error.value = '请输入镜像名称'
    return
  }

  loading.value = true
  error.value = ''
  pullLogs.value = []

  try {
    addLog(`开始拉取镜像: ${imageName.value}`)

    const response = await fetch(`/api/forward/${props.nodeId}/docker/images/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageName: imageName.value.trim()
      })
    })

    const data = await response.json()

    if (data.success) {
      const { taskId } = data.data
      addLog(`任务已创建，ID: ${taskId}`)
      addLog('任务已提交，详细信息请前往任务中心查看')

      loading.value = false
      setTimeout(() => {
        emit('success')
        visible.value = false
      }, 1500)
    } else {
      throw new Error(data.message || '创建拉取镜像任务失败')
    }
  } catch (err) {
    error.value = err.message || '创建拉取镜像任务时发生错误'
    addLog(`错误: ${error.value}`)
    loading.value = false
  }
}
</script>

<style scoped>
.help-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.mb-4 {
  margin-bottom: 16px;
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
