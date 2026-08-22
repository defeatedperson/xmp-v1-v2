<template>
  <div class="root-password-card">

    <div class="card-content">
      <div class="root-form">
        <el-form label-width="80px" label-position="top">
          <el-form-item label="新密码">
            <div class="root-password-row">
              <el-input
                v-model="rootPassword"
                placeholder="请输入新密码"
                show-password
              />
              <el-button @click="generateRootPassword" :disabled="rootLoading">
                生成
              </el-button>
            </div>
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input
              v-model="rootConfirmPassword"
              placeholder="请再次输入新密码"
              show-password
            />
          </el-form-item>
        </el-form>
        <div class="root-actions">
          <el-button
            type="primary"
            @click="submitRootPassword"
            :loading="rootLoading"
          >
            更新 Root 密码
          </el-button>
        </div>
        <div v-if="rootError" class="root-error">
          {{ rootError }}
        </div>
        <div v-if="taskId" class="root-task">
          <div class="task-progress-row">
            <div class="task-progress-bar">
              <div
                class="task-progress-inner"
                :style="{
                  width: (taskProgress || 0) + '%',
                  background:
                    taskStatus === 'failed'
                      ? '#ef4444'
                      : taskStatus === 'completed'
                        ? '#22c55e'
                        : '#3b82f6'
                }"
              />
            </div>
            <span class="task-progress-text">{{ taskProgress }}%</span>
          </div>
          <div class="task-status-text">
            状态：{{ taskStatus || '等待中' }}
            <span v-if="taskMessage">（{{ taskMessage }}）</span>
          </div>
          <div class="task-log-list" v-if="taskLogs.length">
            <div
              v-for="log in taskLogs"
              :key="log.timestamp + log.message"
              class="task-log-item"
            >
              <span class="task-log-time">
                {{ new Date(log.timestamp).toLocaleString('zh-CN') }}
              </span>
              <span class="task-log-message">
                {{ log.message }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  nodeId: {
    type: [String, Number],
    default: ''
  }
})

const rootPassword = ref('')
const rootConfirmPassword = ref('')
const rootLoading = ref(false)
const rootError = ref('')
const taskId = ref('')
const taskStatus = ref('')
const taskProgress = ref(0)
const taskMessage = ref('')
const taskLogs = ref([])

let pollTimer = null

const resetRootTaskState = () => {
  taskId.value = ''
  taskStatus.value = ''
  taskProgress.value = 0
  taskMessage.value = ''
  taskLogs.value = []
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const submitRootPassword = async () => {
  if (!props.nodeId) {
    rootError.value = '请选择节点'
    return
  }
  if (!rootPassword.value) {
    rootError.value = '请填写新密码'
    return
  }
  if (rootPassword.value !== rootConfirmPassword.value) {
    rootError.value = '两次输入的密码不一致'
    return
  }
  try {
    rootLoading.value = true
    rootError.value = ''
    resetRootTaskState()
    const url = `/api/forward/${props.nodeId}/mysql/admin/root-password`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: rootPassword.value })
    })
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok) {
      rootError.value = result && result.message ? result.message : '更新失败'
      return
    }
    if (!result || !result.success || !result.data || !result.data.taskId) {
      rootError.value = result && result.message ? result.message : '更新失败'
      return
    }
    taskId.value = String(result.data.taskId || '')
    startPolling()
  } catch {
    rootError.value = '更新失败'
  } finally {
    rootLoading.value = false
  }
}

const generateRootPassword = () => {
  const length = 20
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+'
  const array = new Uint32Array(length)
  crypto.getRandomValues(array)
  let result = ''
  for (let i = 0; i < length; i += 1) {
    result += charset[array[i] % charset.length]
  }
  rootPassword.value = result
  rootConfirmPassword.value = result
}

const startPolling = () => {
  if (!taskId.value || !props.nodeId) return
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  const run = async () => {
    const url = `/api/forward/${props.nodeId}/tasks/${taskId.value}`
    const resp = await fetch(url).catch(() => null)
    if (!resp) return
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok || !result || !result.success || !result.data) return
    const t = result.data
    taskStatus.value = t.status || ''
    taskProgress.value = t.progress || 0
    taskMessage.value = t.message || ''
    taskLogs.value = Array.isArray(t.logs) ? t.logs.slice(-10) : []
    if (taskStatus.value === 'completed') {
      clearInterval(pollTimer)
      pollTimer = null
      ElMessage.success('Root 密码修改成功')
    } else if (taskStatus.value === 'failed') {
      clearInterval(pollTimer)
      pollTimer = null
      ElMessage.error(taskMessage.value || '任务失败')
      rootError.value = taskMessage.value || '任务失败'
    }
  }
  run()
  pollTimer = setInterval(run, 1000)
}

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
})
</script>

<style scoped>
.root-password-card {
  background: transparent;
  border-radius: 8px;
}


.root-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 600px;
}

.root-password-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.root-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.root-error {
  color: var(--el-color-danger);
  font-size: 13px;
  margin-top: 8px;
}

.root-task {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.task-progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-progress-bar {
  flex: 1;
  height: 8px;
  background: var(--el-fill-color-darker);
  border-radius: 4px;
  overflow: hidden;
}

.task-progress-inner {
  height: 100%;
  transition: width 0.3s ease;
}

.task-progress-text {
  min-width: 50px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: right;
}

.task-status-text {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.task-log-list {
  max-height: 200px;
  overflow-y: auto;
  background: var(--el-fill-color-darker);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
}

.task-log-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.task-log-item:last-child {
  margin-bottom: 0;
}

.task-log-time {
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.task-log-message {
  word-break: break-all;
}

@media (max-width: 768px) {
  .root-password-row {
    flex-direction: column;
  }
}
</style>
