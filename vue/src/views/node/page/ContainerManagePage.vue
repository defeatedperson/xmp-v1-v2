<template>
  <div class="container-manage-page">
    <!-- 顶部操作栏 -->
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :nodeType="1"
          @node-selected="handleNodeSelected"
          @error="handleNodeError"
        />
        <el-input
          v-model="searchQuery"
          placeholder="搜索容器名称或镜像..."
          class="search-input"
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <div class="header-right">
        <el-button-group class="action-buttons">
          <el-button :icon="Refresh" @click="loadContainers" :loading="loading">刷新</el-button>
          <el-button type="primary" :icon="Promotion" @click="goToAppStore">应用商店</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 容器列表表格 -->
    <div class="table-container" v-loading="loading" element-loading-text="加载容器列表中...">
      <el-table :data="filteredContainers" style="width: 100%" border stripe>
        <el-table-column prop="name" label="名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="image" label="镜像" min-width="200" show-overflow-tooltip />

        <el-table-column label="状态" width="150" align="center">
          <template #default="{ row }">
            <el-tag :type="row.state === 'running' ? 'success' : 'info'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="端口" min-width="220">
          <template #default="{ row }">
            <div class="port-container" v-if="row.uniquePorts && row.uniquePorts.length > 0">
              <div class="port-display">
                <template v-for="(port, index) in row.uniquePorts.slice(0, 2)" :key="index">
                  <span class="port-item">
                    <span class="port-ip">{{ port.IP || '0.0.0.0' }}</span>
                    <span class="port-separator">:</span>
                    <span class="port-public">{{ port.PublicPort }}</span>
                    <span class="port-arrow">→</span>
                    <span class="port-private">{{ port.PrivatePort }}</span>
                    <span class="port-type">/{{ port.Type }}</span>
                  </span>
                  <span v-if="index < Math.min(row.uniquePorts.length - 1, 1)" class="port-divider">, </span>
                </template>
                <el-tooltip
                  v-if="row.uniquePorts.length > 2"
                  effect="dark"
                  placement="top"
                >
                  <template #content>
                    <div v-for="(port, idx) in row.uniquePorts" :key="idx">
                      {{ port.IP || '0.0.0.0' }}:{{ port.PublicPort }} → {{ port.PrivatePort }}/{{ port.Type }}
                    </div>
                  </template>
                  <span class="port-more">+{{ row.uniquePorts.length - 2 }}</span>
                </el-tooltip>
              </div>
            </div>
            <span v-else class="no-ports">疑似host网络</span>
          </template>
        </el-table-column>

        <el-table-column label="IP地址" width="100" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewNetworks(row)">查看</el-button>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            {{ row.createdTime }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="280" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="warning" @click="openTerminal(row)">终端</el-button>
            <el-button link type="primary" @click="viewLogs(row)">日志</el-button>
            <el-button
              link
              :type="row.state === 'running' ? 'danger' : 'success'"
              @click="toggleContainerStatus(row)"
            >
              {{ row.state === 'running' ? '停止' : '启动' }}
            </el-button>
            <el-button link type="info" @click="editContainer(row)">更多</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 弹窗组件 -->
    <ContainerLogModal
      v-model="logModalVisible"
      :nodeId="currentNodeId"
      :containerId="selectedContainerId"
    />

    <ContainerTerminalModal
      v-model="terminalModalVisible"
      :nodeId="currentNodeId"
      :containerId="selectedContainerId"
    />

    <ContainerNetworkModal
      v-model="networkModalVisible"
      :nodeId="currentNodeId"
      :containerId="selectedContainerId"
    />

    <ContainerManageModal
      v-model="manageModalVisible"
      :nodeId="currentNodeId"
      :containerId="selectedContainerId"
      @updated="loadContainers"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Promotion } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import ContainerLogModal from './container/ContainerLogModal.vue'
import ContainerTerminalModal from './container/ContainerTerminalModal.vue'
import ContainerNetworkModal from './container/ContainerNetworkModal.vue'
import ContainerManageModal from './container/ContainerManageModal.vue'

const router = useRouter()

// 状态
const currentNodeId = ref('')
const containerList = ref([])
const searchQuery = ref('')
const loading = ref(false)

// 弹窗状态
const logModalVisible = ref(false)
const terminalModalVisible = ref(false)
const networkModalVisible = ref(false)
const manageModalVisible = ref(false)
const selectedContainerId = ref('')

// 过滤后的容器列表
const filteredContainers = computed(() => {
  if (!searchQuery.value) return containerList.value
  const query = searchQuery.value.toLowerCase()
  return containerList.value.filter(
    (container) =>
      container.name.toLowerCase().includes(query) ||
      container.image.toLowerCase().includes(query)
  )
})

// Docker API
const dockerAPI = {
  async testConnection(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/test-connection`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  async getContainers(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/containers`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  async toggleContainer(nodeId, containerId, action, payload = {}) {
    const url = `/api/forward/${nodeId}/docker/containers/${containerId}/${action}`
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }
    if (action === 'stop') {
      const timeout = typeof payload.timeout === 'number' ? payload.timeout : 10
      options.body = JSON.stringify({ timeout })
    }
    const response = await fetch(url, options)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
}

// 加载容器
const loadContainers = async () => {
  if (!currentNodeId.value) return

  loading.value = true
  try {
    const connectionTest = await dockerAPI.testConnection(currentNodeId.value)
    if (!connectionTest.success) {
      throw new Error(connectionTest.message || 'Docker连接失败')
    }

    const response = await dockerAPI.getContainers(currentNodeId.value)
    if (response.success) {
      containerList.value = (response.data || []).map((container) => ({
        ...container,
        uniquePorts: getUniquePorts(container.ports || []),
        createdTime: formatDate(container.created)
      }))
      if (containerList.value.length === 0) {
        ElMessage.info('未找到容器')
      }
    } else {
      throw new Error(response.message || '获取容器列表失败')
    }
  } catch (err) {
    ElMessage.error(err.message)
    containerList.value = []
  } finally {
    loading.value = false
  }
}

// 节点选择
const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  loadContainers()
}

const handleNodeError = (errorMsg) => {
  ElMessage.error(`节点错误: ${errorMsg}`)
  containerList.value = []
}

// 容器操作
const toggleContainerStatus = async (container) => {
  const isRunning = container.state === 'running'
  const action = isRunning ? 'stop' : 'start'
  const actionText = isRunning ? '停止' : '启动'

  try {
    await ElMessageBox.confirm(`确定要${actionText}容器 "${container.name}" 吗？`, '提示', {
      type: 'warning'
    })

    const response = await dockerAPI.toggleContainer(currentNodeId.value, container.containerId, action, { timeout: 10 })
    if (response.success) {
      ElMessage.success(`容器${actionText}成功`)
      loadContainers()
    } else {
      throw new Error(response.message || `${actionText}失败`)
    }
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.message)
  }
}

// 辅助函数
const formatDate = (timestamp) => {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const getUniquePorts = (ports) => {
  if (!ports) return []
  const unique = []
  const seen = new Set()
  ports.forEach(port => {
    const key = `${port.IP}-${port.PublicPort}-${port.PrivatePort}-${port.Type}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(port)
    }
  })
  return unique
}

// 页面跳转
const goToAppStore = () => router.push('/app')

// 弹窗处理
const openTerminal = (row) => {
  selectedContainerId.value = row.containerId
  terminalModalVisible.value = true
}

const viewLogs = (row) => {
  selectedContainerId.value = row.containerId
  logModalVisible.value = true
}

const viewNetworks = (row) => {
  selectedContainerId.value = row.containerId
  networkModalVisible.value = true
}

const editContainer = (row) => {
  selectedContainerId.value = row.containerId
  manageModalVisible.value = true
}

onMounted(() => {
  // 初始加载由 NodeSelector 触发
})
</script>

<style scoped>
.container-manage-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-bg-color-overlay);
  padding: 16px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 240px;
}

.table-container {
  background: var(--el-bg-color-overlay);
  padding: 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

/* 端口显示样式 */
.port-display {
  font-family: monospace;
  font-size: 12px;
  background: var(--el-fill-color-darker);
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--el-text-color-regular);
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.port-item { display: inline; }
.port-ip { color: var(--el-text-color-secondary); }
.port-separator { color: var(--el-text-color-placeholder); }
.port-public { color: var(--el-color-primary); font-weight: bold; }
.port-arrow { color: var(--el-color-warning); margin: 0 4px; }
.port-private { color: var(--el-color-success); font-weight: bold; }
.port-type { color: var(--el-color-info); }
.port-divider { color: var(--el-text-color-placeholder); margin: 0 4px; }
.port-more {
  color: var(--el-color-danger);
  font-weight: bold;
  margin-left: 4px;
  cursor: pointer;
}

.no-ports {
  color: var(--el-text-color-placeholder);
  font-style: italic;
  font-size: 12px;
}

@media (max-width: 1000px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  .header-left, .header-right {
    width: 100%;
    justify-content: space-between;
  }
  .search-input {
    flex: 1;
  }
}
</style>
