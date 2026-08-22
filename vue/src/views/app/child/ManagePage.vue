<template>
  <div class="manage-page">
    <!-- 顶部筛选与操作区 -->
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
          <el-button :icon="Refresh" @click="loadContainers" :loading="loading" title="刷新列表">刷新</el-button>
          <el-button :icon="Download" @click="openImportModal" title="导入备份">导入</el-button>
          <el-button :icon="QuestionFilled" @click="openMoreActions" title="新手指导">指导</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 容器列表 -->
    <div class="cards-container" v-loading="loading">
      <div v-for="container in filteredContainers" :key="container.containerId" class="container-card">
        <div class="card-header">
          <div class="card-title">
            <span class="name" :title="container.name">{{ container.name }}</span>
            <span class="image" :title="container.image">{{ container.image }}</span>
          </div>
          <el-tag :type="container.state === 'running' ? 'success' : 'info'" size="small" effect="dark" round>
            {{ container.state === 'running' ? '已启动' : '已停止' }}
          </el-tag>
        </div>

        <div class="card-content">
          <div class="info-item">
            <span class="label">创建时间:</span>
            <span class="value">{{ container.createdTime }}</span>
          </div>

          <div class="section">
            <div class="section-header">
              <span class="section-title">端口映射</span>
              <el-button link type="primary" size="small" @click="copyMappedPorts(container)">复制端口</el-button>
            </div>
            <div class="port-display" v-if="container.ports && container.ports.length > 0">
              <template v-for="(port, index) in container.ports.slice(0, 3)" :key="index">
                <span class="port-item">{{ formatPortMapping(port) }}</span>
                <span v-if="index < Math.min(container.ports.length - 1, 2)" class="port-divider">, </span>
              </template>
              <span v-if="container.ports.length > 3" class="port-more">+{{ container.ports.length - 3 }}</span>
            </div>
            <div v-else class="no-ports">疑似host网络，点击查看IP地址可获取网络模式</div>
          </div>

          <div class="section">
            <span class="section-title">访问方式</span>
            <div class="endpoint-group">
              <div class="endpoint-row">
                <span class="endpoint-label">公网访问:</span>
                <div class="endpoint-list" v-if="buildPublicEndpoints(container).length > 0">
                  <div v-for="ep in buildPublicEndpoints(container)" :key="ep" class="endpoint-item">
                    <span class="endpoint-pill">{{ ep }}</span>
                    <el-button link type="primary" :icon="CopyDocument" @click="copyText(ep)"></el-button>
                  </div>
                </div>
                <span v-else class="endpoint-empty-hint">尚未开启公网访问</span>
              </div>
              <div class="endpoint-row">
                <span class="endpoint-label">容器名:</span>
                <div class="endpoint-list">
                  <div v-for="ep in buildNameEndpoints(container)" :key="ep" class="endpoint-item">
                    <span class="endpoint-pill">{{ ep }}</span>
                    <el-button link type="primary" :icon="CopyDocument" @click="copyText(ep)"></el-button>
                  </div>
                </div>
              </div>
              <div class="endpoint-row">
                <span class="endpoint-label">容器IP:</span>
                <el-button link type="primary" @click="viewNetworks(container)">查看IP地址</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="card-actions">
          <el-button
            :type="container.state === 'running' ? 'warning' : 'success'"
            plain
            size="small"
            @click="toggleContainerStatus(container)"
          >
            {{ container.state === 'running' ? '停止' : '启动' }}
          </el-button>

          <el-button
            v-if="shouldShowCreateWebsiteButton(container)"
            type="primary"
            size="small"
            @click="openCreateWebsiteModal(container)"
          >
            建站
          </el-button>

          <el-button type="info" plain size="small" @click="openBackupModal(container)">备份</el-button>
          <el-button type="primary" plain size="small" @click="openContainerSettings(container)">更多</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && filteredContainers.length === 0" description="暂无内容" />

    <!-- 弹窗组件 -->
    <ContainerNetworkModal
      v-model="showNetworkModal"
      :nodeId="currentNodeId"
      :containerId="selectedContainerId"
    />
    <MoreActionsModal
      v-if="showMoreActions"
      @close="showMoreActions = false"
    />
    <AppContainerSettingsModal
      v-if="showSettingsModal"
      :nodeId="currentNodeId"
      :containerId="selectedSettingsContainerId"
      @close="showSettingsModal = false"
      @updated="loadContainers"
    />
    <ContainerBackupModal
      v-if="showBackupModal"
      :nodeId="currentNodeId"
      :containerId="selectedBackupContainerId"
      :containerName="selectedBackupContainerName"
      @close="showBackupModal = false"
    />
    <BackupImportModal
      v-if="showImportModal"
      :nodeId="currentNodeId"
      @close="showImportModal = false"
    />
    <AppCreateWebsiteModal
      :visible="showCreateWebsiteModal"
      :nodeId="currentNodeId"
      :containerId="selectedCreateWebsiteContainerId"
      :containerName="selectedCreateWebsiteContainerName"
      :containerPorts="selectedCreateWebsiteContainerPorts"
      @close="showCreateWebsiteModal = false"
      @created="handleWebsiteCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Download, QuestionFilled, CopyDocument } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import ContainerNetworkModal from '../../node/page/container/ContainerNetworkModal.vue'
import MoreActionsModal from './modal/MoreActionsModal.vue'
import AppContainerSettingsModal from './modal/AppContainerSettingsModal.vue'
import ContainerBackupModal from './modal/ContainerBackupModal.vue'
import BackupImportModal from './modal/BackupImportModal.vue'
import AppCreateWebsiteModal from './modal/AppCreateWebsiteModal.vue'

const currentNodeId = ref('')
const containerList = ref([])
const searchQuery = ref('')
const loading = ref(false)
const error = ref('')
const selectedContainerId = ref('')
const showNetworkModal = ref(false)
const showMoreActions = ref(false)
const selectedSettingsContainerId = ref('')
const showSettingsModal = ref(false)
const showBackupModal = ref(false)
const showImportModal = ref(false)
const selectedBackupContainerId = ref('')
const selectedBackupContainerName = ref('')
const showCreateWebsiteModal = ref(false)
const selectedCreateWebsiteContainerId = ref('')
const selectedCreateWebsiteContainerName = ref('')
const selectedCreateWebsiteContainerPorts = ref([])

const filteredContainers = computed(() => {
  let containers = containerList.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    containers = containers.filter(
      (container) =>
        container.name.toLowerCase().includes(query) ||
        container.image.toLowerCase().includes(query)
    )
  }

  return containers
})



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

const handleNodeSelected = async (node) => {
  currentNodeId.value = node.id
  await loadContainers()
}

const handleNodeError = (errorMsg) => {
  ElMessage({
    message: `节点选择错误: ${errorMsg}`,
    type: 'error',
    duration: 5000,
    showClose: true,
  })
  containerList.value = []
}

const loadContainers = async () => {
  if (!currentNodeId.value) return

  loading.value = true
  error.value = ''

  try {
    const connectionTest = await dockerAPI.testConnection(currentNodeId.value)
    if (!connectionTest.success) {
      ElMessage({
        message: `Docker连接失败: ${connectionTest.message || '未知错误'}`,
        type: 'error',
        duration: 5000,
        showClose: true,
      })
      throw new Error(connectionTest.message || 'Docker连接测试失败')
    }

    const response = await dockerAPI.getContainers(currentNodeId.value)
    if (!response.success) {
      ElMessage({
        message: `获取容器列表失败: ${response.message || '未知错误'}`,
        type: 'error',
        duration: 5000,
        showClose: true,
      })
      throw new Error(response.message || '获取容器列表失败')
    }

    containerList.value = (response.data || []).map((container) => ({
      containerId: container.containerId,
      name: container.name,
      image: container.image,
      status: container.status,
      state: container.state,
      ports: container.ports || [],
      portsDisplay: formatPorts(container.ports || []),
      created: container.created,
      createdTime: formatDate(container.created)
    }))

    if (containerList.value.length === 0) {
      ElMessage({
        message: '节点docker连接成功，但没有找到容器',
        type: 'info',
        duration: 3000,
      })
    }
  } catch (err) {
    if (!err.message.includes('Docker连接测试失败') && !err.message.includes('获取容器列表失败')) {
      ElMessage({
        message: `加载容器失败: ${err.message}`,
        type: 'error',
        duration: 5000,
        showClose: true,
      })
    }
    containerList.value = []
    console.error('加载容器失败:', err)
  } finally {
    loading.value = false
  }
}

const formatPorts = (ports) => {
  if (!ports || ports.length === 0) return '疑似host网络，点击查看ip地址可获取网络模式'

  const uniquePorts = []
  const portMap = new Map()

  ports.forEach(port => {
    const key = `${port.IP || ''}-${port.PublicPort || ''}-${port.PrivatePort}-${port.Type}`
    if (!portMap.has(key)) {
      portMap.set(key, true)
      uniquePorts.push(port)
    }
  })

  if (uniquePorts.length > 2) {
    const displayedPorts = uniquePorts.slice(0, 2)
    const formattedPorts = displayedPorts.map(port => {
      if (port.PublicPort) {
        return `${port.IP || '0.0.0.0'}:${port.PublicPort}→${port.PrivatePort}/${port.Type}`
      }
      return `${port.PrivatePort}/${port.Type}`
    })
    return formattedPorts.join(', ') + ` (+${uniquePorts.length - 2})`
  }

  return uniquePorts.map(port => {
    if (port.PublicPort) {
      return `${port.IP || '0.0.0.0'}:${port.PublicPort}→${port.PrivatePort}/${port.Type}`
    }
    return `${port.PrivatePort}/${port.Type}`
  }).join(', ')
}

const formatDate = (timestamp) => {
  const date = new Date(timestamp * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}


const formatPortMapping = (port) => {
  if (!port) return ''
  if (port.PublicPort) return `${port.IP || '0.0.0.0'}:${port.PublicPort}→${port.PrivatePort}/${port.Type}`
  return `${port.PrivatePort}/${port.Type}`
}

const buildPublicEndpoints = (container) => {
  const list = []
  const ports = container.ports || []
  ports.forEach(p => {
    if (p.PublicPort && p.IP === '0.0.0.0') list.push(`${p.IP}:${p.PublicPort}`)
  })
  return list
}

const buildNameEndpoints = (container) => {
  const ports = container.ports || []
  const set = new Set()
  ports.forEach(p => { if (p.PublicPort) set.add(`${container.name}:${p.PublicPort}`) })
  return Array.from(set)
}

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage({ message: '已复制到剪贴板', type: 'success' })
  } catch {
    ElMessage({ message: '复制失败', type: 'error', showClose: true })
  }
}

const copyMappedPorts = async (container) => {
  const ports = container.ports || []
  const set = new Set()
  ports.forEach(p => { if (p.PublicPort) set.add(String(p.PublicPort)) })
  const values = Array.from(set)
  if (values.length === 0) {
    ElMessage({ message: '无映射端口可复制', type: 'warning' })
    return
  }
  const text = values.join(',')
  await copyText(text)
}

const toggleContainerStatus = async (container) => {
  try {
    const action = container.state === 'running' ? 'stop' : 'start'
    const actionText = container.state === 'running' ? '停止' : '启动'

    await ElMessageBox.confirm(
      `确定要${actionText}容器 "${container.name}" 吗？`,
      `${actionText}容器确认`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    const response = await dockerAPI.toggleContainer(
      currentNodeId.value,
      container.containerId,
      action,
      { timeout: 10 }
    )
    if (response.success) {
      ElMessage({
        message: `容器${actionText}成功`,
        type: 'success',
      })
      await loadContainers()
    } else {
      throw new Error(response.message || `${actionText}失败`)
    }
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage({
        message: `容器操作失败: ${err.message}`,
        type: 'error',
        duration: 5000,
        showClose: true,
      })
      console.error('容器操作失败:', err)
    }
  }
}

const viewNetworks = (container) => {
  selectedContainerId.value = container.containerId
  showNetworkModal.value = true
}

const openMoreActions = () => {
  showMoreActions.value = true
}

const openImportModal = () => {
  showImportModal.value = true
}

const openContainerSettings = (container) => {
  selectedSettingsContainerId.value = container.containerId
  showSettingsModal.value = true
}

const openBackupModal = (container) => {
  selectedBackupContainerId.value = container.containerId
  selectedBackupContainerName.value = container.name
  showBackupModal.value = true
}

const hasPublicPorts = (container) => {
  return container.ports && container.ports.length > 0 && container.ports.some(p => p.PublicPort)
}

const shouldShowCreateWebsiteButton = (container) => {
  if (container.state !== 'running') return false
  if (!hasPublicPorts(container)) return false

  const name = container.name.toLowerCase()
  if (/^php\d{2}$/.test(name)) return false
  if (/^mysql\d$/.test(name)) return false
  if (name === 'redis') return false

  return true
}

const openCreateWebsiteModal = (container) => {
  selectedCreateWebsiteContainerId.value = container.containerId
  selectedCreateWebsiteContainerName.value = container.name
  selectedCreateWebsiteContainerPorts.value = container.ports || []
  showCreateWebsiteModal.value = true
}

const handleWebsiteCreated = () => {
  ElMessage({
    message: '网站创建成功',
    type: 'success',
  })
}

onMounted(() => {
  // 等待节点选择后再加载数据
})
</script>

<style scoped>
.manage-page {
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

.cards-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 10px;
}

.container-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s ease;
}

.container-card:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.card-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.card-title .name {
  color: var(--el-text-color-primary);
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-title .image {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.info-item .label {
  color: var(--el-text-color-secondary);
}

.info-item .value {
  color: var(--el-text-color-regular);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.port-display {
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  background: var(--el-fill-color-light);
  padding: 8px 12px;
  border-radius: 4px;
  color: var(--el-text-color-regular);
  border: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.port-divider {
  color: var(--el-text-color-placeholder);
  margin: 0 4px;
}

.port-more {
  color: var(--el-color-danger);
  font-weight: bold;
}

.no-ports {
  color: var(--el-text-color-secondary);
  font-style: italic;
  font-size: 12px;
}

.endpoint-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.endpoint-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 24px;
}

.endpoint-label {
  color: var(--el-text-color-secondary);
  min-width: 65px;
  font-size: 12px;
}

.endpoint-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}

.endpoint-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.endpoint-pill {
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
}

.endpoint-empty-hint {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.card-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

/* 响应式 */
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

/* 新手指导按钮样式 */
.guide-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: rgba(14, 165, 233, 0.2);
  color: #0ea5e9;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  font-size: 14px;
}

.guide-btn:hover {
  background: rgba(14, 165, 233, 0.3);
  border-color: #0ea5e9;
}

/* 导入备份按钮样式 */
.import-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  font-size: 14px;
}

.import-btn:hover {
  background: rgba(34, 197, 94, 0.3);
  border-color: #22c55e;
}

.delete-btn {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  margin-right: 5px;
}

.delete-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.5);
}

.status-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
}

.status-badge.started {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.35);
}

.status-badge.stopped {
  background: rgba(100, 116, 139, 0.15);
  color: #64748b;
  border-color: rgba(100, 116, 139, 0.35);
}

.ip-btn {
  background: rgba(14, 165, 233, 0.2);
  color: #0ea5e9;
  border: 1px solid rgba(14, 165, 233, 0.3);
  margin-right: 5px;
}

.ip-btn:hover {
  background: rgba(14, 165, 233, 0.3);
  border-color: rgba(14, 165, 233, 0.5);
}

.port-container {
  width: 100%;
}

.port-display {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(30, 41, 59, 0.5));
  padding: 4px 8px;
  border-radius: 6px;
  color: #e2e8f0;
  border: 1px solid rgba(100, 116, 139, 0.15);
  display: inline-block;
  line-height: 1.4;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.port-display:hover {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(30, 41, 59, 0.7));
  border-color: rgba(100, 116, 139, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.port-item { display: inline; }
.port-ip { color: #94a3b8; }
.port-separator { color: #64748b; margin: 0 1px; }
.port-public { color: #60a5fa; font-weight: bold; }
.port-arrow { color: #f59e0b; margin: 0 2px; }
.port-private { color: #34d399; font-weight: bold; }
.port-type { color: #a78bfa; }
.port-divider { color: #64748b; margin: 0 2px; }
.port-more { color: #f87171; font-weight: bold; margin-left: 4px; }
.no-ports { color: #94a3b8; font-style: italic; font-size: 12px; }

.backup-btn {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.backup-btn:hover {
  background: rgba(251, 191, 36, 0.3);
  border-color: rgba(251, 191, 36, 0.5);
}

.more-btn {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.more-btn:hover {
  background: rgba(168, 85, 247, 0.3);
  border-color: rgba(168, 85, 247, 0.5);
}

.create-website-btn {
  background: rgba(14, 165, 233, 0.2);
  color: #0ea5e9;
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.create-website-btn:hover {
  background: rgba(14, 165, 233, 0.3);
  border-color: rgba(14, 165, 233, 0.5);
}

.port-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.port-header .section-title {
  margin: 0;
}

.port-header .port-copy-btn {
  margin-top: 0;
}
</style>
