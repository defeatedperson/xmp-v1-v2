<template>
  <div class="task-detail-panel" v-loading="loading">
    <div v-if="!taskDetails" class="empty-state">
      <el-empty description="请选择一个任务查看详情"></el-empty>
    </div>

    <template v-else>
      <!-- 顶部信息栏 -->
      <div class="detail-header">
        <div class="header-left">
          <div class="detail-title">
            <span class="label">任务ID:</span>
            <span class="value">{{ taskDetails.id }}</span>
          </div>
          <el-tag :type="statusTagType" effect="dark" size="small">
            {{ statusText }}
          </el-tag>
        </div>

        <div class="header-right">
          <div v-if="autoRefresh" class="auto-refresh-indicator">
            <el-icon class="is-loading"><Loading /></el-icon>
          </div>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="progress-section" v-if="taskDetails.progress !== undefined">
        <div class="progress-info">
          <span>进度: {{ taskDetails.progress }}%</span>
          <span>{{ taskDetails.message }}</span>
        </div>
        <el-progress
          :percentage="taskDetails.progress"
          :status="progressStatus"
          :stroke-width="10"
          striped
          striped-flow
        />
      </div>

      <!-- 详细参数 (可折叠) -->
      <el-collapse v-model="activeNames" class="params-collapse">
        <el-collapse-item title="任务参数" name="1">
          <div class="params-grid">
            <div class="param-item">
              <span class="label">类型:</span>
              <span class="value">{{ taskDetails.type }}</span>
            </div>
            <div class="param-item">
              <span class="label">创建时间:</span>
              <span class="value">{{ formatDateTime(taskDetails.createdAt) }}</span>
            </div>
            <div class="param-item" v-for="(val, key) in displayData" :key="key">
              <span class="label">{{ key }}:</span>
              <span class="value">{{ val }}</span>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 日志区域 -->
      <div class="logs-section">
        <div class="logs-header">运行日志</div>
        <div class="logs-container" ref="logsContainer">
          <div v-if="!taskDetails.logs || taskDetails.logs.length === 0" class="no-logs">暂无日志</div>
          <div v-else v-for="(log, index) in taskDetails.logs" :key="index" class="log-line">
            <span class="log-time">[{{ formatTime(log.timestamp) }}]</span>
            <span class="log-msg">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'

const props = defineProps({
  taskDetails: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  autoRefresh: {
    type: Boolean,
    default: false
  }
})

defineEmits(['refresh', 'toggle-auto-refresh'])

const activeNames = ref(['1'])
const logsContainer = ref(null)

// 自动滚动到底部
watch(() => props.taskDetails?.logs, async () => {
  await nextTick()
  if (logsContainer.value) {
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight
  }
}, { deep: true })

const statusTagType = computed(() => {
  const map = { running: '', completed: 'success', failed: 'danger' }
  return map[props.taskDetails?.status] || 'info'
})

const statusText = computed(() => {
  const map = { running: '运行中', completed: '已完成', failed: '失败' }
  return map[props.taskDetails?.status] || props.taskDetails?.status
})

const progressStatus = computed(() => {
  if (props.taskDetails?.status === 'failed') return 'exception'
  if (props.taskDetails?.status === 'completed') return 'success'
  return ''
})

const displayData = computed(() => {
  if (!props.taskDetails?.data) return {}
  const { imageName, sourceName, ...rest } = props.taskDetails.data
  return {
    ...(imageName && { '镜像名称': imageName }),
    ...(sourceName && { '源名称': sourceName }),
    ...rest
  }
})

const formatDateTime = (str) => {
  if (!str) return ''
  return new Date(str).toLocaleString()
}

const formatTime = (str) => {
  if (!str) return ''
  return new Date(str).toLocaleTimeString()
}
</script>

<style scoped>
.task-detail-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-header {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* 允许自动换行 */
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-title {
  font-size: 16px;
  font-weight: 500;
}

.auto-refresh-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-color-primary);
}

.progress-section {
  padding: 16px;
  background: var(--el-fill-color-light);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.params-collapse {
  border-top: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-collapse-item__header) {
  padding-left: 16px;
  background-color: var(--el-bg-color-overlay);
}

:deep(.el-collapse-item__content) {
  padding: 16px;
}

.params-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-item .label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.param-item .value {
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logs-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 16px 16px;
}

.logs-header {
  padding: 12px 0;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.logs-container {
  flex: 1;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  padding: 12px;
  border-radius: 4px;
  overflow-y: auto;
  line-height: 1.5;
}

.log-line {
  margin-bottom: 2px;
}

.log-time {
  color: #569cd6;
  margin-right: 8px;
}

.no-logs {
  color: #6e7681;
  text-align: center;
  margin-top: 20px;
}
</style>
