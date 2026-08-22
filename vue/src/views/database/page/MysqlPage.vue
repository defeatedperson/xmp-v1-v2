<template>
  <div class="mysql-page">
    <!-- 顶部筛选与状态区 -->
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          class="node-select-wrapper"
        />
        <!-- MySQL 状态集成 -->
        <div v-if="currentNodeId" class="status-indicator" @click="openStatusModal" title="点击查看详情与操作">
          <el-tag :type="statusTagType" effect="dark" round class="status-tag clickable">
            <i :class="statusIcon" class="status-icon"></i>
            MySQL: {{ statusText }}
          </el-tag>
        </div>
      </div>

      <div class="header-right">
        <el-input
          v-model="searchQuery"
          placeholder="搜索数据库名称..."
          class="search-input"
          clearable
          @keyup.enter="loadDatabases"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-button-group class="action-buttons">
          <el-button :icon="Refresh" @click="handleRefresh" :loading="loading" title="刷新列表">刷新</el-button>
          <el-button :icon="Switch" @click="handleSync" title="同步数据库">同步</el-button>
          <el-button type="primary" :icon="Plus" @click="openCreateModal">创建数据库</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 数据库表格 -->
    <div class="table-container" v-loading="loading">
      <el-table :data="filteredDatabases" style="width: 100%" border stripe>
        <el-table-column prop="name" label="数据库名称" min-width="150">
          <template #default="{ row }">
            <div class="copy-cell">
              <span class="name-text">{{ row.name }}</span>
              <el-button link type="primary" :icon="CopyDocument" @click="copyToClipboard(row.name)" title="复制名称"></el-button>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="username" label="用户名" min-width="120">
          <template #default="{ row }">
            <div class="copy-cell">
              <span class="text-secondary">{{ row.username }}</span>
              <el-button link type="primary" :icon="CopyDocument" @click="copyToClipboard(row.username)" title="复制用户名"></el-button>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="password" label="密码" min-width="180">
          <template #default="{ row }">
            <div class="password-cell">
              <span class="password-text">{{ row.showPassword ? row.password : '••••••' }}</span>
              <div class="password-actions">
                <el-button link type="primary" :icon="row.showPassword ? View : Hide" @click="row.showPassword = !row.showPassword"></el-button>
                <el-button link type="primary" :icon="CopyDocument" @click="copyToClipboard(row.password)" v-if="row.showPassword"></el-button>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="charset" label="字符集" width="120" align="center" />

        <el-table-column prop="time" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.time) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="changePassword(row)">修改密码</el-button>
            <el-button link type="primary" @click="openBackupModal(row)">备份</el-button>
            <el-button link type="danger" @click="deleteDatabase(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 容器连接信息 -->
    <ContainerConnectionCard
      v-if="currentNodeId"
      :node-id="currentNodeId"
    />

    <!-- 弹窗组件 -->
    <CreateDatabaseModal
      v-model:visible="createModalVisible"
      :node-id="currentNodeId"
      @created="loadDatabases"
    />

    <ChangePasswordModal
      v-model:visible="changePasswordModalVisible"
      :node-id="currentNodeId"
      :database="currentDatabase"
      @updated="loadDatabases"
    />

    <DatabaseBackupModal
      v-model:visible="backupModalVisible"
      :node-id="currentNodeId"
      :database="currentDatabase"
    />

    <MySqlStatusModal
      v-model:visible="statusModalVisible"
      :node-id="currentNodeId"
      @refresh="handleRefresh"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, Plus, Switch,
  CopyDocument, View, Hide
} from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import CreateDatabaseModal from './mysql/CreateDatabaseModal.vue'
import ChangePasswordModal from './mysql/ChangePasswordModal.vue'
import DatabaseBackupModal from './mysql/DatabaseBackupModal.vue'
import MySqlStatusModal from './mysql/MySqlStatusModal.vue'
import ContainerConnectionCard from './mysql/ContainerConnectionCard.vue'

const searchQuery = ref('')
const currentNodeId = ref('')
const databases = ref([])
const loading = ref(false)
const serviceStatus = ref('') // 正常, 未启动, 不存在, 连接失败
const createModalVisible = ref(false)
const changePasswordModalVisible = ref(false)
const backupModalVisible = ref(false)
const statusModalVisible = ref(false)
const currentDatabase = ref(null)

// 状态标签配置
const statusTagType = computed(() => {
  switch (serviceStatus.value) {
    case '正常': return 'success'
    case '未启动': return 'warning'
    case '不存在': return 'info'
    default: return 'danger'
  }
})

const statusIcon = computed(() => {
  switch (serviceStatus.value) {
    case '正常': return 'fas fa-check-circle'
    case '未启动': return 'fas fa-pause-circle'
    case '不存在': return 'fas fa-question-circle'
    default: return 'fas fa-exclamation-triangle'
  }
})

const statusText = computed(() => {
  return serviceStatus.value || '检测中...'
})

// API 定义
const mysqlAPI = {
  async listDatabases(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/mysql/databases`)
    return await response.json()
  },
  async fetchStatus(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/mysql/admin/status`)
    return await response.json()
  },
  async deleteDatabase(nodeId, name, username) {
    const url = `/api/forward/${nodeId}/mysql/databases/${encodeURIComponent(name)}?userName=${encodeURIComponent(username)}&dropUser=true`
    const response = await fetch(url, { method: 'DELETE' })
    return await response.json()
  },
  async syncDatabases(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/mysql/databases/sync`, { method: 'POST' })
    return await response.json()
  }
}

// 过滤后的数据库列表
const filteredDatabases = computed(() => {
  if (!searchQuery.value) return databases.value
  const query = searchQuery.value.toLowerCase()
  return databases.value.filter(db =>
    (db.name || '').toLowerCase().includes(query) ||
    (db.username || '').toLowerCase().includes(query)
  )
})

// 获取 MySQL 状态
const loadStatus = async () => {
  if (!currentNodeId.value) return
  try {
    const response = await fetch(`/api/forward/${currentNodeId.value}/mysql/admin/status`)
    if (!response.ok && response.status === 502) {
      serviceStatus.value = '连接失败'
      return
    }
    const result = await response.json().catch(() => ({}))
    if (result && result.success) {
      serviceStatus.value = result.data?.status || '未知'
    } else {
      const msg = String(result?.message || result?.error || '')
      if (msg.includes('ECONNREFUSED')) {
        serviceStatus.value = '连接失败'
      } else {
        serviceStatus.value = '异常'
      }
    }
  } catch {
    serviceStatus.value = '连接失败'
  }
}

// 加载数据库列表
const loadDatabases = async () => {
  if (!currentNodeId.value) return
  loading.value = true
  try {
    const result = await mysqlAPI.listDatabases(currentNodeId.value)
    if (result && result.success) {
      databases.value = (result.data || []).map(raw => ({
        id: raw.id || `${raw.dbName}-${raw.userName}`,
        name: raw.dbName,
        username: raw.userName,
        password: raw.password || '',
        showPassword: false,
        charset: raw.charset || '',
        time: raw.createdAt || '',
      }))
    } else {
      throw new Error(result.message || '加载失败')
    }
  } catch (e) {
    ElMessage.error(e.message || '加载数据库列表失败')
    databases.value = []
  } finally {
    loading.value = false
  }
}

// 处理节点选择
const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  loadDatabases()
  loadStatus()
}

// 刷新
const handleRefresh = async () => {
  await Promise.all([loadDatabases(), loadStatus()])
  ElMessage.success('数据已更新')
}

// 同步
const handleSync = async () => {
  if (serviceStatus.value !== '正常') {
    return ElMessage.warning('数据库服务未运行，无法同步')
  }
  try {
    await ElMessageBox.confirm('确定从服务端同步数据库到本地记录？', '同步确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const result = await mysqlAPI.syncDatabases(currentNodeId.value)
    if (result && result.success) {
      const added = result.data?.added?.length || 0
      ElMessage.success(`同步完成，新增 ${added} 个数据库`)
      loadDatabases()
    } else {
      throw new Error(result.message || '同步失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '同步失败')
  }
}

// 格式化
const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

// 复制
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

// 操作处理
const openStatusModal = () => {
  if (!currentNodeId.value) return
  statusModalVisible.value = true
}

const openCreateModal = () => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  if (serviceStatus.value !== '正常') return ElMessage.warning('数据库服务异常')
  createModalVisible.value = true
}

const changePassword = (db) => {
  if (serviceStatus.value !== '正常') return ElMessage.warning('数据库服务异常')
  currentDatabase.value = db
  changePasswordModalVisible.value = true
}

const openBackupModal = (db) => {
  if (serviceStatus.value !== '正常') return ElMessage.warning('数据库服务异常')
  currentDatabase.value = db
  backupModalVisible.value = true
}

const deleteDatabase = async (db) => {
  if (serviceStatus.value !== '正常') return ElMessage.warning('数据库服务异常')
  try {
    await ElMessageBox.confirm(`确定删除数据库 "${db.name}" 吗？此操作将同时删除对应的数据库用户，且不可恢复！`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    })
    const result = await mysqlAPI.deleteDatabase(currentNodeId.value, db.name, db.username)
    if (result && result.success) {
      ElMessage.success('删除成功')
      loadDatabases()
    } else {
      throw new Error(result.message || '删除失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}
</script>

<style scoped>
.mysql-page {
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

.copy-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.name-text {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-secondary {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.password-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.password-text {
  font-family: monospace;
  color: var(--el-text-color-secondary);
}

.password-actions {
  display: flex;
  gap: 4px;
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
