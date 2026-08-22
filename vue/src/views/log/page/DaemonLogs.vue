<template>
  <div class="daemon-logs-page">
    <!-- 顶部筛选栏 -->
    <div class="page-header">
      <div class="header-left">
        <NodeSelector :node-type="1" @node-selected="handleNodeSelected" />
        <el-tag v-if="logData.path" type="info" effect="plain" class="path-tag">
          <span class="label">日志路径:</span>
          <span class="value">{{ logData.path }}</span>
        </el-tag>
      </div>
      <div class="header-right">
        <el-button :icon="Refresh" circle @click="fetchDaemonLogs" :disabled="!selectedNodeId" />
      </div>
    </div>

    <!-- 日志内容区域 -->
    <div v-if="selectedNodeId" class="log-content-wrapper" v-loading="loading">
      <div class="log-viewer">
        <div v-if="!logData.lines || logData.lines.length === 0" class="no-data">
          <el-empty description="暂无日志内容" :image-size="100" />
        </div>
        <div v-else class="log-lines">
          <div v-for="(line, index) in logData.lines" :key="index" class="log-line">
            <span class="line-number">{{ index + 1 }}</span>
            <span class="line-content">{{ line }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="select-node-tip">
      <el-empty description="请先选择一个节点以查看其守护进程日志" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'

// 状态
const selectedNodeId = ref('')
const logData = ref({ path: '', lines: [] })
const loading = ref(false)

// 方法
const handleNodeSelected = (node) => {
  selectedNodeId.value = node && node.id ? String(node.id) : ''
  if (selectedNodeId.value) {
    fetchDaemonLogs()
  } else {
    logData.value = { path: '', lines: [] }
  }
}

const fetchDaemonLogs = async () => {
  if (!selectedNodeId.value) return

  loading.value = true
  try {
    const response = await fetch(`/api/forward/${selectedNodeId.value}/daemon/log`)

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`)
    }

    const result = await response.json()

    if (result.success) {
      logData.value = result.data || { path: '', lines: [] }
    } else {
      ElMessage.error(result.message || '获取守护进程日志失败')
      logData.value = { path: '', lines: [] }
    }
  } catch (error) {
    console.error('获取守护进程日志出错:', error)
    ElMessage.error(error.message || '获取守护进程日志出错')
    logData.value = { path: '', lines: [] }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.daemon-logs-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
   flex-wrap: wrap;
}

.log-content-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; /* 允许flex子项滚动 */
}

.path-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 0 12px;
  height: 32px;
}

.path-tag .label {
  color: var(--el-text-color-secondary);
}

.path-tag .value {
  color: var(--el-text-color-primary);
  font-family: monospace;
}

.log-viewer {
  flex: 1;
  background: #1e1e1e; /* VS Code dark theme background approximation */
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  padding: 12px;
  overflow-y: auto;
  font-family: 'Fira Code', 'JetBrains Mono', 'Source Code Pro', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #d4d4d4;
  min-height: 400px;
  max-height: calc(100vh - 220px);
}

.log-lines {
  display: flex;
  flex-direction: column;
}

.log-line {
  display: flex;
  gap: 12px;
  padding: 1px 0;
}

.log-line:hover {
  background: rgba(255, 255, 255, 0.05);
}

.line-number {
  color: #858585;
  text-align: right;
  min-width: 35px;
  user-select: none;
  border-right: 1px solid #404040;
  padding-right: 12px;
}

.line-content {
  white-space: pre-wrap;
  word-break: break-all;
  flex: 1;
}

.no-data {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--el-text-color-secondary);
}

.select-node-tip {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}
</style>
