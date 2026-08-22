<template>
  <div class="websites-page">
    <!-- 顶部筛选与状态区 -->
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          class="node-select-wrapper"
        />
        <!-- OpenResty 状态集成 -->
        <div v-if="currentNodeId" class="status-indicator" @click="openOpStatusModal" title="点击查看详情与操作">
          <el-tag :type="statusTagType" effect="dark" round class="status-tag clickable">
            <i :class="statusIcon" class="status-icon"></i>
            OpenResty: {{ statusText }}
          </el-tag>
        </div>
      </div>

      <div class="header-right">
        <el-input
          v-model="searchQuery"
          placeholder="搜索网站名称..."
          class="search-input"
          clearable
          @keyup.enter="loadSites"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-button-group class="action-buttons">
          <el-button :icon="Refresh" @click="handleRefresh" :loading="loading" title="刷新列表">刷新</el-button>
          <el-button :icon="Switch" @click="handleSync" title="同步配置">同步</el-button>
          <el-button type="primary" :icon="Plus" @click="openCreateModal">创建网站</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 网站表格 -->
    <div class="table-container" v-loading="loading">
      <el-table :data="filteredWebsites" style="width: 100%" border stripe>
        <el-table-column prop="name" label="名称" min-width="200">
          <template #default="{ row }">
            <div class="website-name-cell">
              <span class="name-text" :title="row.name">{{ row.name }}</span>
              <div class="name-actions">
                <el-button link type="primary" :icon="Setting" @click="editWebsite(row)" title="设置"></el-button>
                <el-button link type="primary" :icon="CopyDocument" @click="copyWebsiteName(row.name)" title="复制域名"></el-button>
                <el-link :href="'http://' + row.name" target="_blank" underline="never" class="visit-link">
                  <el-icon><Link /></el-icon>
                </el-link>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="type" label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getTypeTagType(row.type)" size="small">
              {{ getTypeText(row.type) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="directory" label="网站目录" min-width="180">
          <template #default="{ row }">
            <div class="directory-cell">
              <el-button link type="primary" :icon="FolderOpened" @click="openWebsiteDirectory(row)" title="打开目录"></el-button>
              <span class="directory-text" :title="formatDirectory(row.directory)">
                {{ formatDirectory(row.directory) }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status ? 'success' : 'danger'" size="small">
              {{ row.status ? '已启动' : '未启动' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="protocol" label="协议" width="80" align="center" />

        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />

        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="editWebsite(row)">设置</el-button>
            <el-button link type="primary" @click="openWebsiteBackupModal(row)">备份</el-button>
            <el-button link type="danger" @click="deleteWebsite(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 弹窗组件 -->
    <CreateWebsiteModal
      v-model:visible="showCreateModal"
      :node-id="currentNodeId"
      @created="loadSites"
    />

    <OpStatusModal
      v-model:visible="showOpModal"
      :node-id="currentNodeId"
      @refresh="loadStatus"
    />

    <WebsiteBackupModal
      v-model="showBackupModal"
      :node-id="currentNodeId"
      :domain="currentBackupDomain"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, Plus, Switch,
  Setting, CopyDocument, Link, FolderOpened
} from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import CreateWebsiteModal from './website/CreateWebsiteModal.vue'
import OpStatusModal from './website/OpStatusModal.vue'
import WebsiteBackupModal from './website/WebsiteBackupModal.vue'

const emit = defineEmits(['open-site-settings'])

const router = useRouter()
const searchQuery = ref('')
const currentNodeId = ref('')
const websites = ref([])
const loading = ref(false)
const serviceStatus = ref('') // running, stopped, error, not_installed
const showCreateModal = ref(false)
const showOpModal = ref(false)
const showBackupModal = ref(false)
const currentBackupDomain = ref('')

// 状态标签配置
const statusTagType = computed(() => {
  switch (serviceStatus.value) {
    case 'running': return 'success'
    case 'stopped': return 'warning'
    case 'not_installed': return 'info'
    default: return 'danger'
  }
})

const statusIcon = computed(() => {
  switch (serviceStatus.value) {
    case 'running': return 'fas fa-check-circle'
    case 'stopped': return 'fas fa-pause-circle'
    case 'not_installed': return 'fas fa-question-circle'
    default: return 'fas fa-exclamation-triangle'
  }
})

const statusText = computed(() => {
  switch (serviceStatus.value) {
    case 'running': return '运行中'
    case 'stopped': return '已停止'
    case 'not_installed': return '未安装'
    case 'error': return '连接失败'
    default: return '检测中...'
  }
})

// API 定义
const websiteAPI = {
  async listSites(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/sites`)
    return await response.json()
  },
  async deleteSite(nodeId, domain) {
    const response = await fetch(`/api/forward/${nodeId}/sites/${domain}`, { method: 'DELETE' })
    return await response.json()
  },
  async fetchStatus(nodeId) {
    const resp = await fetch(`/api/forward/${nodeId}/website/openresty/status`)
    return await resp.json()
  }
}

// 过滤后的网站列表
const filteredWebsites = computed(() => {
  if (!searchQuery.value) return websites.value
  const query = searchQuery.value.toLowerCase()
  return websites.value.filter(site => site.name.toLowerCase().includes(query))
})

// 获取 OpenResty 状态
const loadStatus = async () => {
  if (!currentNodeId.value) return
  try {
    const result = await websiteAPI.fetchStatus(currentNodeId.value)
    if (result && result.success) {
      const data = result.data || {}
      serviceStatus.value = data.running ? 'running' : (data.exists ? 'stopped' : 'not_installed')
    } else {
      serviceStatus.value = 'error'
    }
  } catch {
    serviceStatus.value = 'error'
  }
}

// 加载网站列表
const loadSites = async () => {
  if (!currentNodeId.value) return
  loading.value = true
  try {
    const response = await websiteAPI.listSites(currentNodeId.value)
    if (response && response.success) {
      websites.value = response.data || []
    } else {
      throw new Error(response.message || '加载失败')
    }
  } catch (e) {
    ElMessage.error(e.message || '加载网站列表失败')
    websites.value = []
  } finally {
    loading.value = false
  }
}

// 处理节点选择
const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  loadSites()
  loadStatus()
}

// 刷新
const handleRefresh = async () => {
  await Promise.all([loadSites(), loadStatus()])
  ElMessage.success('数据已更新')
}

// 同步
const handleSync = async () => {
  try {
    await ElMessageBox.confirm('确定从配置同步网站列表到本地记录？', '同步确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const resp = await fetch(`/api/forward/${currentNodeId.value}/sites/refresh`, { method: 'POST' })
    const result = await resp.json()
    if (result && result.success) {
      ElMessage.success(`同步完成，共 ${result.data?.total || 0} 个站点`)
      loadSites()
    } else {
      throw new Error(result.message || '同步失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '同步失败')
  }
}

// 格式化
const getTypeText = (type) => {
  const map = { static: '静态', proxy: '反向代理', php: 'PHP' }
  return map[type] || type
}

const getTypeTagType = (type) => {
  const map = { static: 'info', proxy: 'warning', php: 'success' }
  return map[type] || ''
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const formatDirectory = (dir) => {
  if (!dir) return ''
  return dir.startsWith('/openresty/') ? dir : `/openresty/${dir}`
}

// 操作处理
const editWebsite = (site) => {
  if (!site.id) return ElMessage.error('站点ID缺失')
  emit('open-site-settings', String(site.id))
}

const copyWebsiteName = async (name) => {
  try {
    await navigator.clipboard.writeText(name)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

const openWebsiteDirectory = (site) => {
  const path = formatDirectory(site.directory)
  router.push({ name: 'file', query: { path } })
}

const deleteWebsite = async (site) => {
  try {
    await ElMessageBox.confirm(`确定删除网站 "${site.name}" 吗？此操作不可恢复！`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    })
    const res = await websiteAPI.deleteSite(currentNodeId.value, site.name)
    if (res.success) {
      ElMessage.success('删除成功')
      loadSites()
    } else {
      throw new Error(res.message)
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

// 弹窗控制
const openCreateModal = () => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  showCreateModal.value = true
}
const openOpStatusModal = () => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  showOpModal.value = true
}

const openWebsiteBackupModal = (site) => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  currentBackupDomain.value = site.name
  showBackupModal.value = true
}
</script>

<style scoped>
.websites-page {
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

.status-indicator {
  display: flex;
  align-items: center;
}

.status-tag {
  font-weight: 500;
  padding: 0 12px;
  height: 32px;
}

.status-tag.clickable {
  cursor: pointer;
  transition: all 0.3s;
}

.status-tag.clickable:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.status-icon {
  margin-right: 6px;
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

.website-name-cell {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.name-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  opacity: 0.6;
  transition: opacity 0.3s;
}

.website-name-cell:hover .name-actions {
  opacity: 1;
}

.visit-link {
  display: inline-flex;
  align-items: center;
  padding: 0 4px;
}

.directory-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.directory-text {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table) {
  --el-table-header-bg-color: var(--el-fill-color-light);
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
</style>
