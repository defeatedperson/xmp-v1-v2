<template>
  <div class="node-environment-page">
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          @error="handleNodeError"
          class="node-select-wrapper"
        />
      </div>

      <div class="header-right">
        <el-input
          v-model="searchQuery"
          placeholder="搜索容器名称或镜像..."
          class="search-input"
          clearable
          @keyup.enter="loadContainers"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-button-group class="action-buttons">
          <el-button type="primary" :icon="Plus" @click="toggleCreateStep">
            {{ showCreateStep ? '收起创建步骤' : '创建程序' }}
          </el-button>
          <el-button :icon="Refresh" @click="handleRefresh" :loading="loading">刷新</el-button>
        </el-button-group>
      </div>
    </div>

    <div class="table-container" v-loading="loading" element-loading-text="加载 Nodejs 容器中...">
      <el-table :data="filteredContainers" style="width: 100%" border stripe>
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />

        <el-table-column label="目录" width="60" align="center">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="FolderOpened"
              @click="openContainerDirectory(row)"
              :title="formatDirectory(row.name)"
            />
          </template>
        </el-table-column>

        <el-table-column prop="image" label="镜像" min-width="200" show-overflow-tooltip />

        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.state === 'running' ? 'success' : 'info'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="端口" min-width="200">
          <template #default="{ row }">
            <div class="ports-cell">
              <el-tag v-for="p in formatPorts(row.ports)" :key="p" size="small" class="port-tag">{{ p }}</el-tag>
              <span v-if="formatPorts(row.ports).length === 0" class="muted">疑似 host 网络</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="IP地址" width="120" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openNetworks(row)">查看</el-button>
          </template>
        </el-table-column>

        <el-table-column prop="createdTime" label="创建时间" width="170" />

        <el-table-column label="操作" width="320" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openTerminal(row)">终端</el-button>
            <el-button link type="primary" @click="openLogs(row)">日志</el-button>
            <el-button link type="primary" @click="openCreateWebsite(row)">建站</el-button>
            <el-button link type="primary" @click="openSettings(row)">设置</el-button>
            <el-button
              link
              :type="row.state === 'running' ? 'danger' : 'success'"
              @click="toggleContainerStatus(row)"
            >
              {{ row.state === 'running' ? '停止' : '启动' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="showCreateStep" class="create-step-wrapper">
      <NodeJsProjectDirectoryStep :node-id="currentNodeId" />
    </div>

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

    <NodeJsContainerSettingsModal
      v-model="manageModalVisible"
      :nodeId="currentNodeId"
      :containerId="selectedContainerId"
      @updated="loadContainers"
    />

    <AppCreateWebsiteModal
      v-model:visible="createWebsiteVisible"
      :nodeId="currentNodeId"
      :containerId="selectedContainerId"
      :containerName="selectedContainerName"
      :containerPorts="selectedContainerPorts"
      @close="createWebsiteVisible = false"
      @created="handleWebsiteCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, FolderOpened, Plus } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import NodeJsProjectDirectoryStep from '@/views/website/page/nodejs/NodeJsProjectDirectoryStep.vue'
import ContainerLogModal from '@/views/node/page/container/ContainerLogModal.vue'
import ContainerTerminalModal from '@/views/node/page/container/ContainerTerminalModal.vue'
import ContainerNetworkModal from '@/views/node/page/container/ContainerNetworkModal.vue'
import NodeJsContainerSettingsModal from '@/views/website/page/nodejs/NodeJsContainerSettingsModal.vue'
import AppCreateWebsiteModal from '@/views/app/child/modal/AppCreateWebsiteModal.vue'

const router = useRouter()
const currentNodeId = ref('')
const containerList = ref([])
const searchQuery = ref('')
const loading = ref(false)
const selectedContainerId = ref('')
const selectedContainerName = ref('')
const selectedContainerPorts = ref([])
const logModalVisible = ref(false)
const terminalModalVisible = ref(false)
const networkModalVisible = ref(false)
const manageModalVisible = ref(false)
const createWebsiteVisible = ref(false)
const showCreateStep = ref(false)

const dockerAPI = {
  async testConnection(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/test-connection`)
    return await response.json()
  },
  async getContainers(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/containers`)
    return await response.json()
  },
  async toggleContainer(nodeId, containerId, action) {
    const url = `/api/forward/${nodeId}/docker/containers/${containerId}/${action}`
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
    if (action === 'stop') {
      options.body = JSON.stringify({ timeout: 10 })
    }
    const response = await fetch(url, options)
    return await response.json()
  },
}

const filteredContainers = computed(() => {
  const pattern = /^defeatedperson\/nodejs:v[0-9.]+$/i
  let list = containerList.value.filter((env) => pattern.test(env.image))
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    list = list.filter(
      (env) =>
        String(env.name || '').toLowerCase().includes(query) ||
        String(env.image || '').toLowerCase().includes(query),
    )
  }
  return list
})

const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  showCreateStep.value = false
  loadContainers()
}

const handleNodeError = (errorMsg) => {
  ElMessage({
    message: `节点选择错误: ${errorMsg}`,
    type: 'error',
    duration: 5000,
    showClose: true,
  })
}

const handleRefresh = async () => {
  if (!currentNodeId.value) return
  await loadContainers()
  ElMessage.success('数据已更新')
}

const toggleCreateStep = () => {
  if (!currentNodeId.value) {
    ElMessage.warning('请先选择节点')
    return
  }
  showCreateStep.value = !showCreateStep.value
}

const loadContainers = async () => {
  if (!currentNodeId.value) {
    containerList.value = []
    return
  }
  loading.value = true
  try {
    const connectionTest = await dockerAPI.testConnection(currentNodeId.value)
    if (!connectionTest.success) {
      throw new Error(connectionTest.message || 'Docker连接失败')
    }
    const response = await dockerAPI.getContainers(currentNodeId.value)
    if (!response.success) {
      throw new Error(response.message || '获取容器列表失败')
    }
    containerList.value = (response.data || []).map((container) => ({
      containerId: container.containerId,
      name: container.name,
      image: container.image,
      status: container.status,
      state: container.state,
      ports: container.ports || [],
      created: container.created,
      createdTime: formatDate(container.created),
    }))
  } catch (err) {
    ElMessage.error(err.message || '加载容器失败')
    containerList.value = []
  } finally {
    loading.value = false
  }
}

const formatDate = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatPorts = (ports) => {
  if (!Array.isArray(ports)) return []
  return ports.slice(0, 3).map((port) => {
    const ip = port.IP || '0.0.0.0'
    const publicPort = port.PublicPort || '-'
    const privatePort = port.PrivatePort || '-'
    const type = port.Type || 'tcp'
    return `${ip}:${publicPort}→${privatePort}/${type}`
  })
}

const formatDirectory = (name) => {
  if (!name) return ''
  return `/${name}/app`
}

const openContainerDirectory = (container) => {
  if (!container || !container.name) return
  router.push({ name: 'file', query: { path: formatDirectory(container.name) } })
}

const openLogs = (container) => {
  selectedContainerId.value = container.containerId
  logModalVisible.value = true
}

const openTerminal = (container) => {
  selectedContainerId.value = container.containerId
  terminalModalVisible.value = true
}

const openNetworks = (container) => {
  selectedContainerId.value = container.containerId
  networkModalVisible.value = true
}

const openSettings = (container) => {
  selectedContainerId.value = container.containerId
  manageModalVisible.value = true
}

const openCreateWebsite = (container) => {
  selectedContainerId.value = container.containerId
  selectedContainerName.value = container.name
  selectedContainerPorts.value = container.ports || []
  createWebsiteVisible.value = true
}

const handleWebsiteCreated = () => {
  ElMessage.success('网站创建成功')
}

const toggleContainerStatus = async (container) => {
  try {
    const action = container.state === 'running' ? 'stop' : 'start'
    const actionText = container.state === 'running' ? '停止' : '启动'
    await ElMessageBox.confirm(`确定要${actionText}容器 "${container.name}" 吗？`, '操作确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const response = await dockerAPI.toggleContainer(currentNodeId.value, container.containerId, action)
    if (!response.success) {
      throw new Error(response.message || `${actionText}失败`)
    }
    ElMessage.success(`容器${actionText}成功`)
    await loadContainers()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '容器操作失败')
    }
  }
}
</script>

<style scoped>
.node-environment-page {
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
  gap: 16px;
}

.node-select-wrapper {
  width: 220px;
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

.create-step-wrapper {
  border-radius: var(--el-border-radius-base);
}

.ports-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.port-tag {
  margin-right: 4px;
}

.muted {
  color: var(--el-text-color-secondary);
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
    flex-wrap: wrap;
    gap: 12px;
  }

  .search-input {
    flex: 1;
  }
}
</style>
