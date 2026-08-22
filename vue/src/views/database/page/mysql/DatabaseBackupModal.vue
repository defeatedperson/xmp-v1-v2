<template>
  <el-dialog
    v-model="dialogVisible"
    title="数据库备份管理"
    :width="dialogWidth"
    :close-on-click-modal="false"
    :before-close="handleClose"
    append-to-body
    destroy-on-close
    class="backup-modal"
  >
    <template #header>
      <div class="dialog-header">
        <span class="el-dialog__title">数据库备份管理</span>
        <div class="db-info" v-if="database">
          数据库: <el-tag size="small" effect="plain">{{ database.name }}</el-tag>
        </div>
      </div>
    </template>

    <div class="modal-content" v-loading="loading">
      <el-tabs v-model="activeTab" class="backup-tabs">
        <!-- 创建备份 -->
        <el-tab-pane label="创建" name="create">
          <div class="tab-pane-content">
            <el-alert
              title="备份说明"
              type="warning"
              description="备份会导出当前数据库的逻辑备份文件，建议在低峰期执行。"
              show-icon
              :closable="false"
            />

            <div class="action-section">
              <div v-if="createConfirmVisible" class="confirm-container">
                <p class="confirm-text">
                  <el-icon class="warning-icon"><Warning /></el-icon>
                  确认为当前数据库创建备份
                </p>
                <div class="confirm-buttons">
                  <el-button
                    type="warning"
                    @click="confirmCreateBackup"
                    :disabled="actionLoading || createCountdown > 0"
                  >
                    确认创建 {{ createCountdown > 0 ? `(${createCountdown}s)` : '' }}
                  </el-button>
                  <el-button @click="cancelCreateConfirm" :disabled="actionLoading">取消</el-button>
                </div>
              </div>
              <el-button
                v-else
                type="primary"
                @click="showCreateConfirm"
                :disabled="actionLoading"
              >
                创建备份
              </el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- 还原备份 -->
        <el-tab-pane label="还原" name="restore">
          <div class="tab-pane-content">
            <div class="section-header">
              <h3 class="section-title">本数据库备份</h3>
              <el-button :icon="Refresh" circle size="small" @click="loadBackups" :disabled="actionLoading" />
            </div>

            <el-alert
              title="提示"
              type="info"
              :closable="false"
              class="mb-4"
            >
              <template #default>
                列表中的备份仅针对当前数据库，可在文件管理中通过路径 <code>/mysql8/backup/self/{{ database?.name }}</code> 下载。
              </template>
            </el-alert>

            <div v-if="restoreConfirmVisible" class="confirm-container mb-4">
              <p class="confirm-text">
                <el-icon class="warning-icon"><Warning /></el-icon>
                确认还原备份: {{ selectedSelfBackupName }}
              </p>
              <div class="confirm-buttons">
                <el-button
                  type="warning"
                  @click="confirmRestoreSelf"
                  :disabled="actionLoading || restoreCountdown > 0"
                >
                  确认还原 {{ restoreCountdown > 0 ? `(${restoreCountdown}s)` : '' }}
                </el-button>
                <el-button @click="cancelRestoreConfirm" :disabled="actionLoading">取消</el-button>
              </div>
            </div>

            <div v-if="deleteConfirmVisible" class="confirm-container mb-4">
              <p class="confirm-text">
                <el-icon class="warning-icon"><Warning /></el-icon>
                确认删除备份文件: {{ selectedDeleteBackupName }}
              </p>
              <div class="confirm-buttons">
                <el-button
                  type="danger"
                  @click="confirmDeleteBackup"
                  :disabled="actionLoading || deleteCountdown > 0"
                >
                  确认删除 {{ deleteCountdown > 0 ? `(${deleteCountdown}s)` : '' }}
                </el-button>
                <el-button @click="cancelDeleteConfirm" :disabled="actionLoading">取消</el-button>
              </div>
            </div>

            <el-table :data="selfBackups" style="width: 100%" size="small" border stripe>
              <el-table-column prop="name" label="备份名称" min-width="180" />
              <el-table-column label="创建时间" width="160">
                <template #default="{ row }">
                  {{ formatBackupTime(row.name) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="180" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button
                    link
                    type="primary"
                    @click="downloadSelfBackup(row)"
                    :disabled="actionLoading"
                  >
                    下载
                  </el-button>
                  <el-button
                    link
                    type="primary"
                    @click="showRestoreConfirm(row)"
                    :disabled="restoreConfirmVisible || deleteConfirmVisible || actionLoading"
                  >
                    还原
                  </el-button>
                  <el-button
                    link
                    type="danger"
                    @click="showDeleteConfirm(row)"
                    :disabled="restoreConfirmVisible || deleteConfirmVisible || actionLoading"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 导入备份 -->
        <el-tab-pane label="导入" name="import">
          <div class="tab-pane-content">
            <div class="section-header">
              <h3 class="section-title">外部导入备份</h3>
              <el-button :icon="Refresh" circle size="small" @click="loadBackups" :disabled="actionLoading" />
            </div>

            <el-alert
              title="提示"
              type="info"
              :closable="false"
              class="mb-4"
            >
              <template #default>
                请通过文件管理将备份文件上传到 <code>/mysql8/backup/import</code> 目录。
              </template>
            </el-alert>

            <div v-if="importConfirmVisible" class="confirm-container mb-4">
              <p class="confirm-text">
                <el-icon class="warning-icon"><Warning /></el-icon>
                确认导入备份到当前数据库: {{ selectedUploadBackupName }}
              </p>
              <div class="confirm-buttons">
                <el-button
                  type="warning"
                  @click="confirmImport"
                  :disabled="actionLoading || importCountdown > 0"
                >
                  确认导入 {{ importCountdown > 0 ? `(${importCountdown}s)` : '' }}
                </el-button>
                <el-button @click="cancelImportConfirm" :disabled="actionLoading">取消</el-button>
              </div>
            </div>

            <el-table :data="uploadBackups" style="width: 100%" size="small" border stripe>
              <el-table-column prop="name" label="备份名称" min-width="180" />
              <el-table-column label="备份时间" width="160">
                <template #default="{ row }">
                  {{ formatBackupTime(row.name) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="showImportConfirm(row)" :disabled="importConfirmVisible || actionLoading">导入</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 任务日志部分 -->
      <div v-if="taskId" class="task-log-section">
        <div class="task-log-header">
          <span class="task-title">任务日志</span>
          <div class="task-status-info">
            <el-tag size="small" :type="taskStatusType">{{ taskStatusText }}</el-tag>
            <span v-if="taskProgress" class="progress-text">进度: {{ taskProgress }}%</span>
          </div>
        </div>

        <el-progress
          v-if="taskStatus === 'running' || taskStatus === 'waiting'"
          :percentage="taskProgress"
          :status="taskProgress === 100 ? 'success' : ''"
          :indeterminate="taskProgress === 0"
          class="mb-2"
        />

        <div class="log-container">
          <el-scrollbar ref="logScrollbar" height="150px">
            <div v-for="(log, index) in taskLogs" :key="index" class="log-item">
              <span class="log-time">[{{ new Date(log.timestamp).toLocaleTimeString() }}]</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
            <div v-if="taskLogs.length === 0" class="no-logs">暂无日志内容</div>
          </el-scrollbar>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose" :disabled="actionLoading">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Warning } from '@element-plus/icons-vue'

const props = defineProps({
  visible: { type: Boolean, required: true },
  nodeId: { type: String, required: true },
  database: { type: Object, required: true }
})

const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 响应式布局
const dialogWidth = ref('780px')
const updateDialogWidth = () => {
  if (window.innerWidth < 768) {
    dialogWidth.value = '95%'
  } else {
    dialogWidth.value = '780px'
  }
}

onMounted(() => {
  updateDialogWidth()
  window.addEventListener('resize', updateDialogWidth)
  if (props.visible) {
    loadBackups()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateDialogWidth)
  stopAllTimers()
})

const activeTab = ref('create')
const loading = ref(false)
const actionLoading = ref(false)
const selfBackups = ref([])
const uploadBackups = ref([])

const taskId = ref('')
const taskStatus = ref('')
const taskProgress = ref(0)
const taskMessage = ref('')
const taskLogs = ref([])
const logScrollbar = ref(null)
let taskPollTimer = null

const createConfirmVisible = ref(false)
const createCountdown = ref(0)
let createCountdownTimer = null

const restoreConfirmVisible = ref(false)
const restoreCountdown = ref(0)
let restoreCountdownTimer = null
const selectedSelfBackupName = ref('')

const deleteConfirmVisible = ref(false)
const deleteCountdown = ref(0)
let deleteCountdownTimer = null
const selectedDeleteBackupName = ref('')

const importConfirmVisible = ref(false)
const importCountdown = ref(0)
let importCountdownTimer = null
const selectedUploadBackupName = ref('')

const taskStatusType = computed(() => {
  switch (taskStatus.value) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'running': return 'primary'
    default: return 'info'
  }
})

const taskStatusText = computed(() => {
  switch (taskStatus.value) {
    case 'completed': return '已完成'
    case 'failed': return '已失败'
    case 'running': return '运行中'
    case 'waiting': return '等待中'
    default: return taskStatus.value || '未知'
  }
})

const stopAllTimers = () => {
  if (taskPollTimer) clearInterval(taskPollTimer)
  if (createCountdownTimer) clearInterval(createCountdownTimer)
  if (restoreCountdownTimer) clearInterval(restoreCountdownTimer)
  if (importCountdownTimer) clearInterval(importCountdownTimer)
  if (deleteCountdownTimer) clearInterval(deleteCountdownTimer)
}

const resetTaskState = () => {
  taskId.value = ''
  taskStatus.value = ''
  taskProgress.value = 0
  taskMessage.value = ''
  taskLogs.value = []
  if (taskPollTimer) {
    clearInterval(taskPollTimer)
    taskPollTimer = null
  }
}

const handleClose = () => {
  if (actionLoading.value) return
  resetTaskState()
  emit('update:visible', false)
}

const ensureDbName = () => {
  const name = props.database?.name || props.database?.dbName
  if (!name) throw new Error('缺少数据库名称')
  return name
}

const loadBackups = async () => {
  if (!props.nodeId || !props.database) return
  try {
    loading.value = true
    const dbName = ensureDbName()
    const response = await fetch(`/api/forward/${props.nodeId}/mysql/databases/${encodeURIComponent(dbName)}/backups`)
    const result = await response.json()
    if (result.success) {
      selfBackups.value = result.data?.self || []
      uploadBackups.value = result.data?.upload || []
    } else {
      throw new Error(result.message || '获取备份列表失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

// 创建备份逻辑
const showCreateConfirm = () => {
  createConfirmVisible.value = true
  createCountdown.value = 5
  createCountdownTimer = setInterval(() => {
    createCountdown.value--
    if (createCountdown.value <= 0) {
      clearInterval(createCountdownTimer)
    }
  }, 1000)
}

const cancelCreateConfirm = () => {
  createConfirmVisible.value = false
  if (createCountdownTimer) clearInterval(createCountdownTimer)
}

const confirmCreateBackup = async () => {
  try {
    actionLoading.value = true
    const dbName = ensureDbName()
    const response = await fetch(`/api/forward/${props.nodeId}/mysql/databases/${encodeURIComponent(dbName)}/backup`, {
      method: 'POST'
    })
    const result = await response.json()
    if (result.success && result.data?.taskId) {
      resetTaskState()
      taskId.value = String(result.data.taskId)
      ElMessage.success('备份任务已创建')
      startTaskPolling()
      createConfirmVisible.value = false
      loadBackups()
    } else {
      throw new Error(result.message || '创建备份失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

// 还原逻辑
const showRestoreConfirm = (row) => {
  selectedSelfBackupName.value = row.name
  restoreConfirmVisible.value = true
  restoreCountdown.value = 5
  restoreCountdownTimer = setInterval(() => {
    restoreCountdown.value--
    if (restoreCountdown.value <= 0) {
      clearInterval(restoreCountdownTimer)
    }
  }, 1000)
}

const cancelRestoreConfirm = () => {
  restoreConfirmVisible.value = false
  if (restoreCountdownTimer) clearInterval(restoreCountdownTimer)
}

const showDeleteConfirm = (row) => {
  selectedDeleteBackupName.value = row.name
  deleteConfirmVisible.value = true
  deleteCountdown.value = 5
  deleteCountdownTimer = setInterval(() => {
    deleteCountdown.value--
    if (deleteCountdown.value <= 0) {
      clearInterval(deleteCountdownTimer)
    }
  }, 1000)
}

const cancelDeleteConfirm = () => {
  deleteConfirmVisible.value = false
  if (deleteCountdownTimer) clearInterval(deleteCountdownTimer)
}

const confirmDeleteBackup = async () => {
  try {
    actionLoading.value = true
    const dbName = ensureDbName()
    const path = `/mysql8/backup/self/${dbName}`
    const response = await fetch(`/api/forward/${props.nodeId}/file/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path,
        type: 'file',
        name: selectedDeleteBackupName.value,
        force: false
      })
    })
    const result = await response.json()
    if (result.success) {
      if (result.taskId) {
        ElMessage.success('删除任务已创建，请前往任务中心查看进度')
      } else {
        ElMessage.success('备份文件删除成功')
      }
      deleteConfirmVisible.value = false
      selectedDeleteBackupName.value = ''
      loadBackups()
    } else {
      throw new Error(result.error || result.message || '删除备份失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

const confirmRestoreSelf = async () => {
  try {
    actionLoading.value = true
    const dbName = ensureDbName()
    const response = await fetch(`/api/forward/${props.nodeId}/mysql/databases/${encodeURIComponent(dbName)}/backups/self/${encodeURIComponent(selectedSelfBackupName.value)}/restore`, {
      method: 'POST'
    })
    const result = await response.json()
    if (result.success && result.data?.taskId) {
      resetTaskState()
      taskId.value = String(result.data.taskId)
      ElMessage.success('还原任务已创建')
      startTaskPolling()
      restoreConfirmVisible.value = false
    } else {
      throw new Error(result.message || '还原失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

// 导入逻辑
const showImportConfirm = (row) => {
  selectedUploadBackupName.value = row.name
  importConfirmVisible.value = true
  importCountdown.value = 5
  importCountdownTimer = setInterval(() => {
    importCountdown.value--
    if (importCountdown.value <= 0) {
      clearInterval(importCountdownTimer)
    }
  }, 1000)
}

const cancelImportConfirm = () => {
  importConfirmVisible.value = false
  if (importCountdownTimer) clearInterval(importCountdownTimer)
}

const confirmImport = async () => {
  try {
    actionLoading.value = true
    const dbName = ensureDbName()
    const response = await fetch(`/api/forward/${props.nodeId}/mysql/databases/${encodeURIComponent(dbName)}/backups/import/${encodeURIComponent(selectedUploadBackupName.value)}/restore`, {
      method: 'POST'
    })
    const result = await response.json()
    if (result.success && result.data?.taskId) {
      resetTaskState()
      taskId.value = String(result.data.taskId)
      ElMessage.success('导入任务已创建')
      startTaskPolling()
      importConfirmVisible.value = false
    } else {
      throw new Error(result.message || '导入失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

// 任务轮询
const startTaskPolling = () => {
  const poll = async () => {
    try {
      const response = await fetch(`/api/forward/${props.nodeId}/tasks/${taskId.value}`)
      const result = await response.json()
      if (result.success && result.data) {
        const t = result.data
        taskStatus.value = t.status
        taskProgress.value = Number(t.progress || 0)
        taskMessage.value = t.message
        taskLogs.value = Array.isArray(t.logs) ? t.logs.slice(-50) : []

        // 自动滚动日志
        nextTick(() => {
          if (logScrollbar.value) {
            logScrollbar.value.setScrollTop(9999)
          }
        })

        if (t.status === 'completed') {
          clearInterval(taskPollTimer)
          ElMessage.success('任务已完成')
          loadBackups()
        } else if (t.status === 'failed') {
          clearInterval(taskPollTimer)
          ElMessage.error(t.message || '任务执行失败')
        }
      }
    } catch (e) {
      console.error('Polling error:', e)
    }
  }
  poll()
  taskPollTimer = setInterval(poll, 2000)
}

const downloadSelfBackup = async (row) => {
  try {
    actionLoading.value = true
    const dbName = ensureDbName()
    const path = `/mysql8/backup/self/${dbName}`
    const response = await fetch(`/api/forward/${props.nodeId}/file/download/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: 'file', name: row.name })
    })
    const result = await response.json()
    if (result.success && result.data?.token) {
      const downloadUrl = `/api/forward/${props.nodeId}/file/download?token=${encodeURIComponent(result.data.token)}`
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = row.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      ElMessage.success('开始下载')
    } else {
      throw new Error(result.message || '获取下载令牌失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

const formatBackupTime = (name) => {
  const match = String(name || '').match(/(\d{14})/)
  if (!match) return ''
  const t = match[1]
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}`
}

watch(() => props.visible, (val) => {
  if (val) {
    activeTab.value = 'create'
    loadBackups()
  } else {
    resetTaskState()
  }
})
</script>

<style scoped>
.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.db-info {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.modal-content {
  min-height: 400px;
}

.tab-pane-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
}

.action-section {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.confirm-container {
  background: var(--el-fill-color-light);
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  width: 100%;
  border: 1px dashed var(--el-color-warning);
  box-sizing: border-box;
}

.confirm-text {
  margin-bottom: 16px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-color-warning);
  flex-wrap: wrap;
  word-break: break-all;
}

.warning-icon {
  font-size: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.mb-4 {
  margin-bottom: 16px;
}

.task-log-section {
  margin-top: 24px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 16px;
}

.task-log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-title {
  font-weight: 600;
  font-size: 14px;
}

.task-status-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.log-container {
  background: #1e1e1e;
  border-radius: 4px;
  padding: 8px;
  font-family: monospace;
}

.log-item {
  font-size: 12px;
  line-height: 1.6;
  color: #d4d4d4;
  margin-bottom: 2px;
}

.log-time {
  color: #569cd6;
  margin-right: 8px;
}

.no-logs {
  color: #6a9955;
  font-style: italic;
  font-size: 12px;
  text-align: center;
  padding: 20px 0;
}

:deep(.el-tabs__content) {
  overflow: visible;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .confirm-buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .confirm-buttons .el-button {
    margin-left: 0 !important;
    width: 100%;
  }
}
</style>
