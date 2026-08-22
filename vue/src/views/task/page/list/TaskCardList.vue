<template>
  <div class="task-card-list">
    <div
      v-for="task in tasks"
      :key="task.id"
      class="task-card"
      :class="{
        'is-active': currentTaskId === task.id,
        'status-running': task.status === 'running',
        'status-failed': task.status === 'failed',
        'status-completed': task.status === 'completed'
      }"
      @click="$emit('select', task)"
    >
      <div class="card-header">
        <div class="task-name" :title="getTaskName(task)">
          {{ task.type }}
        </div>
        <el-button
          v-if="['completed', 'failed'].includes(task.status)"
          link
          type="danger"
          class="delete-btn"
          @click.stop="$emit('delete', task)"
        >
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <div class="card-body">

        <div class="task-status">
          <el-icon v-if="task.status === 'running'" class="is-loading"><Loading /></el-icon>
          <el-icon v-else-if="task.status === 'completed'"><CircleCheckFilled /></el-icon>
          <el-icon v-else-if="task.status === 'failed'"><CircleCloseFilled /></el-icon>
          <el-icon v-else><Timer /></el-icon>
          <span class="status-text">{{ getStatusLabel(task.status) }}</span>
        </div>
        <div class="task-time">
          {{ formatTime(task.createdAt) }}
        </div>
      </div>
    </div>

    <div v-if="tasks.length === 0" class="empty-placeholder">
      <el-empty description="暂无任务" :image-size="60"></el-empty>
    </div>
  </div>
</template>

<script setup>
import {
  Loading, CircleCheckFilled, CircleCloseFilled, Timer, Close
} from '@element-plus/icons-vue'

defineProps({
  tasks: {
    type: Array,
    default: () => []
  },
  currentTaskId: {
    type: [String, Number],
    default: ''
  }
})

defineEmits(['select', 'delete'])

const getTaskName = (task) => {
  return task.data?.imageName || task.data?.sourceName || task.id
}

const getStatusLabel = (status) => {
  if (status === 'running') return '运行中'
  if (status === 'completed') return '完成'
  if (status === 'failed') return '失败'
  return '等待中'
}

const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}
</script>

<style scoped>
.task-card-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 4px; /* 底部留空间给滚动条 */
  min-height: 50px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
}

/* 滚动条样式优化 */
.task-card-list::-webkit-scrollbar {
  height: 8px;
}
.task-card-list::-webkit-scrollbar-thumb {
  background: var(--el-border-color-darker);
  border-radius: 4px;
}
.task-card-list::-webkit-scrollbar-track {
  background: var(--el-fill-color-darker);
}

.task-card {
  flex: 0 0 200px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--el-color-primary-light-5);
}

.task-card.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
/* 暗黑模式适配 */
html.dark .task-card.is-active {
  background: rgba(64, 158, 255, 0.15);
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.task-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.status-running .task-status { color: var(--el-color-primary); }
.status-completed .task-status { color: var(--el-color-success); }
.status-failed .task-status { color: var(--el-color-danger); }

.delete-btn {
  padding: 0;
  height: auto;
  opacity: 0;
  transition: opacity 0.2s;
}

.task-card:hover .delete-btn {
  opacity: 1;
}

.card-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.task-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.status-text {
  font-size: 12px;
}

.empty-placeholder {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--el-text-color-placeholder);
}
</style>
