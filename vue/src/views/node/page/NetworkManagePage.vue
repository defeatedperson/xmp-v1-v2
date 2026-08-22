<template>
  <div class="network-manage-page">
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
          placeholder="搜索网络名称、驱动或范围..."
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
          <el-button :icon="Refresh" @click="loadNetworks" :loading="loading">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="showCreateModal = true">创建网络</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 网络列表表格 -->
    <div class="table-container" v-loading="loading" element-loading-text="加载网络列表中...">
      <el-table :data="filteredNetworks" style="width: 100%" border stripe>
        <el-table-column prop="name" label="名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="driver" label="驱动" width="100" align="center" />
        <el-table-column prop="scope" label="范围" width="100" align="center" />

        <el-table-column label="IPv6" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enableIPv6 ? 'success' : 'info'">
              {{ row.enableIPv6 ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="内部" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.internal ? 'warning' : 'info'">
              {{ row.internal ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="可附加" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.attachable ? 'success' : 'info'">
              {{ row.attachable ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="入口" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.ingress ? 'success' : 'info'">
              {{ row.ingress ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="containers" label="容器数量" width="100" align="center" />

        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="danger" @click="deleteNetwork(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 创建网络弹窗 -->
    <CreateNetworkModal
      v-model="showCreateModal"
      :nodeId="currentNodeId"
      @success="handleCreateSuccess"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import CreateNetworkModal from './more/CreateNetworkModal.vue'

// 状态
const currentNodeId = ref('')
const networkList = ref([])
const searchQuery = ref('')
const loading = ref(false)
const showCreateModal = ref(false)

// 过滤后的网络列表
const filteredNetworks = computed(() => {
  if (!searchQuery.value) return networkList.value
  const query = searchQuery.value.toLowerCase()
  return networkList.value.filter(
    (network) =>
      network.name.toLowerCase().includes(query) ||
      network.driver.toLowerCase().includes(query) ||
      network.scope.toLowerCase().includes(query)
  )
})

// Docker API
const dockerAPI = {
  async testConnection(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/test-connection`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  async getNetworks(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/networks`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  async deleteNetwork(nodeId, networkId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/networks/${networkId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      try {
        const errorData = await response.json()
        if (errorData.message) {
          errorMessage = errorData.message
          if (errorData.error) {
            errorMessage += ': ' + errorData.error
          }
        }
      } catch {
        // 解析失败使用默认
      }
      throw new Error(errorMessage)
    }
    return response.json()
  }
}

// 加载网络列表
const loadNetworks = async () => {
  if (!currentNodeId.value) return

  loading.value = true
  try {
    const connectionTest = await dockerAPI.testConnection(currentNodeId.value)
    if (!connectionTest.success) {
      throw new Error(connectionTest.message || 'Docker连接失败')
    }

    const response = await dockerAPI.getNetworks(currentNodeId.value)
    if (response.success) {
      networkList.value = (response.data || []).map((n) => ({
        id: n.id,
        name: n.name,
        driver: n.driver || '',
        scope: n.scope || '',
        enableIPv6: n.enableIPv6 || false,
        internal: n.internal || false,
        attachable: n.attachable || false,
        ingress: n.ingress || false,
        containers: n.containers || 0
      }))
    } else {
      throw new Error(response.message || '获取网络列表失败')
    }
  } catch (err) {
    ElMessage.error(err.message)
    networkList.value = []
  } finally {
    loading.value = false
  }
}

// 节点选择
const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  loadNetworks()
}

const handleNodeError = (errorMsg) => {
  ElMessage.error(`节点错误: ${errorMsg}`)
  networkList.value = []
}

// 删除网络
const deleteNetwork = async (network) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除网络 "${network.name}" 吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const response = await dockerAPI.deleteNetwork(currentNodeId.value, network.id)
    if (response.success) {
      ElNotification({
        title: '成功',
        message: '网络删除成功',
        type: 'success',
        duration: 3000
      })
      await loadNetworks()
    } else {
      let errorMessage = response.message || '删除失败'
      if (response.error) {
        errorMessage += ': ' + response.error
      }
      throw new Error(errorMessage)
    }
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '删除网络失败')
    }
  }
}

// 创建成功回调
const handleCreateSuccess = () => {
  loadNetworks()
}
</script>

<style scoped>
.network-manage-page {
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
  width: 280px;
}

.table-container {
  background: var(--el-bg-color-overlay);
  padding: 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
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
