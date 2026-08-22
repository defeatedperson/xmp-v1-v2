<template>
  <div class="node-list-page">
    <!-- 顶部操作栏 -->
    <div class="filter-header">
      <div class="header-left">
        <el-input
          v-model="searchQuery"
          placeholder="搜索备注或IP地址..."
          class="search-input"
          clearable
          @keyup.enter="searchNodes"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" :icon="Search" @click="searchNodes">搜索</el-button>
      </div>

      <div class="header-right">
        <el-button-group class="action-buttons">
          <el-button :icon="Refresh" @click="fetchNodes" :loading="loading">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="openAddNodeModal">添加节点</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 提示区域 -->
    <el-alert
      title="温馨提示"
      type="info"
      :closable="false"
      show-icon
      class="tips-alert"
    >
      <template #default>
        <div>添加节点后，点击【安装】可获取节点安装信息。新版本使用 mTLS 双向认证，无需手动处理 RSA 密钥。</div>
      </template>
    </el-alert>

    <!-- 节点列表表格 -->
    <div class="table-container" v-loading="loading">
      <el-table :data="nodes" style="width: 100%" border stripe>
        <el-table-column prop="name" label="节点ID" width="120">
          <template #default="{ row }">
            <div class="copy-cell">
              <span>{{ row.name }}</span>
              <el-button link type="primary" :icon="CopyDocument" @click="copyToClipboard(row.name)" />
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="address" label="被控地址" min-width="180">
          <template #default="{ row }">
            <div class="address-cell">
              <span class="address-text">
                {{ addressVisibility.get(row.id) ? row.address : '***' }}
              </span>
              <div class="address-actions">
                <el-button link type="primary" :icon="addressVisibility.get(row.id) ? Hide : View" @click="toggleAddressVisibility(row.id)" />
                <el-button link type="primary" :icon="CopyDocument" @click="copyToClipboard(row.address)" />
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />

        <el-table-column prop="version" label="程序版本" width="150">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openAboutModal(row)">版本详情</el-button>
          </template>
        </el-table-column>

        <el-table-column label="节点类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getNodeTypeTag(row.type)">
              {{ getNodeTypeText(row.type) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="updateTime" label="更新时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.updateTime) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="280" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openInstallModal(row)">安装</el-button>
            <el-button link type="primary" v-if="row.type == '1'" @click="openActionsModal(row)">操作</el-button>
            <el-button link type="primary" @click="openSettingsModal(row)">设置</el-button>
            <el-button link type="danger" @click="deleteNode(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 弹窗组件 -->
    <NodeAboutModal
      v-model="aboutModalVisible"
      :node-id="currentNodeId"
    />
    <NodeActionsModal
      v-model="actionsModalVisible"
      :node-id="currentNodeId"
    />
    <NodeSettingsModal
      v-model="settingsModalVisible"
      :node="currentNode"
      @updated="fetchNodes"
    />
    <AddNodeModal
      v-model="addNodeModalVisible"
      @success="fetchNodes"
    />
    <NodeInstallModal
      v-model="installModalVisible"
      :node="currentInstallNode"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Plus, Refresh,
  CopyDocument, View, Hide
} from '@element-plus/icons-vue'
import NodeAboutModal from './list/NodeAboutModal.vue'
import NodeActionsModal from './list/NodeActionsModal.vue'
import NodeSettingsModal from './list/NodeSettingsModal.vue'
import AddNodeModal from './list/AddNodeModal.vue'
import NodeInstallModal from './list/NodeInstallModal.vue'

// 数据状态
const nodes = ref([])
const allNodes = ref([])
const searchQuery = ref('')
const loading = ref(false)
const addressVisibility = ref(new Map())

// 弹窗状态
const aboutModalVisible = ref(false)
const actionsModalVisible = ref(false)
const settingsModalVisible = ref(false)
const addNodeModalVisible = ref(false)
const installModalVisible = ref(false)
const currentInstallNode = ref({})
const currentNodeId = ref('')
const currentNode = ref({})

// 监听搜索
watch(searchQuery, () => {
  searchNodes()
})

// 获取节点列表
const fetchNodes = async () => {
  loading.value = true
  try {
    const response = await fetch('/api/node/list')
    const result = await response.json()

    if (result.success) {
      const nodeList = result.data || []
      const mappedNodes = nodeList.map((node) => ({
        id: node.id,
        name: node.id,
        address: node.address,
        remark: node.remark,
        version: node.program_version,
        type: node.type,
        updateTime: node.updatedAt,
      }))
      allNodes.value = mappedNodes
      nodes.value = [...mappedNodes]
      searchNodes() // 加载后应用搜索过滤
    } else {
      ElMessage.error(result.message || '获取数据失败')
    }
  } catch {
    ElMessage.error('网络请求失败')
  } finally {
    loading.value = false
  }
}

// 搜索逻辑
const searchNodes = () => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) {
    nodes.value = [...allNodes.value]
    return
  }

  nodes.value = allNodes.value.filter((node) => {
    const remark = String(node.remark || '').toLowerCase()
    const address = String(node.address || '').toLowerCase()
    const name = String(node.name || '').toLowerCase()
    return remark.includes(keyword) || address.includes(keyword) || name.includes(keyword)
  })
}

// 删除节点
const deleteNode = async (nodeId) => {
  try {
    await ElMessageBox.confirm('确定要删除这个节点吗？此操作不可恢复！', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    })

    const response = await fetch(`/api/node/${nodeId}`, {
      method: 'DELETE',
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success('节点删除成功')
      fetchNodes()
    } else {
      ElMessage.error(result.message || '删除失败')
    }
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除请求失败')
  }
}

// 辅助函数
const getNodeTypeText = (type) => {
  const typeNum = parseInt(type)
  switch (typeNum) {
    case 1: return '通用被控'
    case 2: return '仅监控'
    case 3: return 'xcc套件'
    default: return '未知类型'
  }
}

const getNodeTypeTag = (type) => {
  const typeNum = parseInt(type)
  switch (typeNum) {
    case 1: return 'success'
    case 2: return 'info'
    case 3: return 'warning'
    default: return ''
  }
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

const toggleAddressVisibility = (nodeId) => {
  const currentVisibility = addressVisibility.value.get(nodeId) || false
  addressVisibility.value.set(nodeId, !currentVisibility)
}

// 弹窗处理
const openAddNodeModal = () => {
  addNodeModalVisible.value = true
}
const openInstallModal = (row) => {
  currentInstallNode.value = row
  installModalVisible.value = true
}
const openAboutModal = (row) => {
  currentNodeId.value = row.id
  aboutModalVisible.value = true
}
const openActionsModal = (row) => {
  currentNodeId.value = row.id
  actionsModalVisible.value = true
}
const openSettingsModal = (row) => {
  currentNode.value = row
  settingsModalVisible.value = true
}

onMounted(() => {
  fetchNodes()
})
</script>

<style scoped>
.node-list-page {
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

.tips-alert {
  border-radius: var(--el-border-radius-base);
}

.table-container {
  background: var(--el-bg-color-overlay);
  padding: 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.address-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.address-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.address-actions {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}

:deep(.el-table) {
  --el-table-header-bg-color: var(--el-fill-color-light);
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
