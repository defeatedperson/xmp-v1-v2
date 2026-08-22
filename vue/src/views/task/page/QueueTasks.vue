<template>
  <div class="queue-tasks-page">
    <!-- 顶部操作栏 -->
    <div class="page-header">
      <div class="header-left">
        <NodeSelector :node-type="1" @node-selected="handleNodeSelected" />
      </div>
      <div class="header-right">
        <el-button-group>
          <el-button :icon="Refresh" @click="refreshList" :loading="listLoading">刷新</el-button>
          <el-button type="danger" plain :icon="Delete" @click="confirmClearCompletedFailed">清理</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 任务列表区域 (水平滚动) -->
    <div class="list-section" v-loading="listLoading">
      <TaskCardList
        :tasks="tasks"
        :current-task-id="selectedTaskId"
        @select="handleTaskSelect"
        @delete="confirmDeleteTask"
      />
    </div>

    <!-- 任务详情区域 (占据剩余高度) -->
    <div class="detail-section">
      <TaskDetailPanel
        :task-details="taskDetails"
        :loading="detailLoading"
        :auto-refresh="!!autoRefreshTimer"
        @refresh="refreshDetails"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Delete } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import TaskCardList from './list/TaskCardList.vue'
import TaskDetailPanel from './list/TaskDetailPanel.vue'

// 状态
const currentNodeId = ref('')
const tasks = ref([])
const listLoading = ref(false)

const selectedTaskId = ref('')
const taskDetails = ref(null)
const detailLoading = ref(false)

const autoRefreshTimer = ref(null)

// API 封装
const api = {
  getTasks: async (nodeId) => {
    const res = await fetch(`/api/forward/${nodeId}/tasks`)
    return await res.json()
  },
  getTaskDetail: async (nodeId, taskId) => {
    const res = await fetch(`/api/forward/${nodeId}/tasks/${taskId}`)
    return await res.json()
  },
  deleteTask: async (nodeId, taskId) => {
    const res = await fetch(`/api/forward/${nodeId}/tasks/${taskId}`, { method: 'DELETE' })
    return await res.json()
  }
}

// 事件处理
const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  refreshList()
}

const refreshList = async () => {
  if (!currentNodeId.value) return
  listLoading.value = true
  try {
    const res = await api.getTasks(currentNodeId.value)
    if (res.success) {
      tasks.value = (res.data || []).sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      )
      // 如果当前选中的任务不在列表中，清空选中
      if (selectedTaskId.value && !tasks.value.find(t => t.id === selectedTaskId.value)) {
        selectedTaskId.value = ''
        taskDetails.value = null
      }
      // 如果没有选中任务且列表不为空，默认选中第一个
      if (!selectedTaskId.value && tasks.value.length > 0) {
        handleTaskSelect(tasks.value[0])
      }
    } else {
      ElMessage.error(res.message || '获取任务列表失败')
    }
  } catch  {
    ElMessage.error('网络错误，无法获取任务列表')
  } finally {
    listLoading.value = false
  }
}

const handleTaskSelect = async (task) => {
  if (selectedTaskId.value === task.id && taskDetails.value) return
  selectedTaskId.value = task.id
  handleAutoRefreshToggle(true)
}

const refreshDetails = async () => {
  if (!currentNodeId.value || !selectedTaskId.value) return

  // 如果不是自动刷新触发的，才显示loading
  if (!autoRefreshTimer.value) {
    detailLoading.value = true
  }

  try {
    const res = await api.getTaskDetail(currentNodeId.value, selectedTaskId.value)
    if (res.success) {
      taskDetails.value = res.data
      // 任务完成后/失败后停止自动刷新
    if (['completed', 'failed'].includes(res.data.status)) {
      stopAutoRefresh()
    }
      const taskInList = tasks.value.find(t => t.id === selectedTaskId.value)
      if (taskInList && res.data.status) {
        taskInList.status = res.data.status
      }
    } else {
      // 如果获取详情失败（可能任务已消失），不弹窗报错，只是清空详情
      console.warn('获取详情失败', res.message)
    }
  } catch (e) {
    console.error(e)
  } finally {
    detailLoading.value = false
  }
}

const confirmDeleteTask = (task) => {
  ElMessageBox.confirm(
    '确定要删除该任务记录吗？',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    try {
      const res = await api.deleteTask(currentNodeId.value, task.id)
      if (res.success) {
        ElMessage.success('删除成功')
        // 如果删除的是当前选中的，清空详情
        if (selectedTaskId.value === task.id) {
          selectedTaskId.value = ''
          taskDetails.value = null
        }
        refreshList()
      } else {
        ElMessage.error(res.message || '删除失败')
      }
    } catch {
      ElMessage.error('删除失败')
    }
  })
}

const confirmClearCompletedFailed = () => {
  const targets = tasks.value.filter(t => ['completed', 'failed'].includes(t.status))
  if (targets.length === 0) return ElMessage.warning('没有可清理的任务')

  ElMessageBox.confirm(
    `确定要清理 ${targets.length} 个已完成或失败的任务吗？`,
    '批量清理',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    // 简单起见，并发删除。如果需要更严谨的批量接口，需后端支持。
    // 这里模拟并发删除
    let successCount = 0
    await Promise.all(targets.map(async (task) => {
      try {
        const res = await api.deleteTask(currentNodeId.value, task.id)
        if (res.success) successCount++
      } catch {
        console.error('删除任务失败', task.id)
      }
    }))
    ElMessage.success(`清理完成，成功删除 ${successCount} 个任务`)
    refreshList()

    // 如果当前选中的任务被删除了
    if (selectedTaskId.value && !tasks.value.find(t => t.id === selectedTaskId.value)) {
      selectedTaskId.value = ''
      taskDetails.value = null
    }
  })
}

const handleAutoRefreshToggle = (enabled) => {
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value)
    autoRefreshTimer.value = null
  }

  if (enabled) {
    refreshDetails()
    autoRefreshTimer.value = setInterval(() => {
      if (selectedTaskId.value) {
        refreshDetails()
      }
    }, 5000)
  }
}

const stopAutoRefresh = () => {
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value)
    autoRefreshTimer.value = null
  }
}

onUnmounted(() => {
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value)
  }
})
</script>

<style scoped>
.queue-tasks-page {
  height: calc(100vh - 84px); /* 减去顶部导航高度，根据实际情况调整 */
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  /* 自动换行 */
  flex-wrap: wrap;
}

.list-section {
  flex-shrink: 0;
  /* 高度由内容撑开，但限制最大高度 */
  max-height: 200px;
}

.detail-section {
  flex: 1;
  min-height: 0; /* 关键：允许 flex 子项缩小到内容以下，触发内部滚动 */
  overflow: hidden;
}
</style>
