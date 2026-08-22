<template>
  <div class="volume-manage-page">
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
          placeholder="搜索存储卷名称..."
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
          <el-button :icon="Refresh" @click="loadVolumes" :loading="loading">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="showCreateModal = true">创建存储卷</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 存储卷列表表格 -->
    <div class="table-container" v-loading="loading" element-loading-text="加载存储卷列表中...">
      <el-table :data="filteredVolumes" style="width: 100%" border stripe>
        <el-table-column prop="name" label="名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="driver" label="驱动" width="100" align="center" />
        <el-table-column prop="mountpoint" label="挂载点" min-width="250" show-overflow-tooltip />
        <el-table-column prop="scope" label="范围" width="100" align="center" />
        
        <el-table-column label="引用数" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.usage?.refCount ?? 0 }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="sizeDisplay" label="容量" width="120" align="right" />
        <el-table-column prop="createdTime" label="创建时间" width="160" align="center" />

        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openVolumeDetail(row)">详情</el-button>
            <el-button link type="danger" @click="deleteVolume(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 弹窗组件 -->
    <CreateVolumeModal
      v-model="showCreateModal"
      :nodeId="currentNodeId"
      @success="loadVolumes"
    />

    <VolumeDetailModal
      v-model="showDetailModal"
      :nodeId="currentNodeId"
      :volumeName="selectedVolumeName"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import CreateVolumeModal from './more/CreateVolumeModal.vue'
import VolumeDetailModal from './more/VolumeDetailModal.vue'

// 状态
const currentNodeId = ref('')
const volumeList = ref([])
const searchQuery = ref('')
const loading = ref(false)

const showCreateModal = ref(false)
const showDetailModal = ref(false)
const selectedVolumeName = ref('')

// 过滤后的存储卷列表
const filteredVolumes = computed(() => {
  if (!searchQuery.value) return volumeList.value
  const query = searchQuery.value.toLowerCase()
  return volumeList.value.filter(
    (vol) => (vol.name || '').toLowerCase().includes(query)
  )
})

// Docker API
const dockerAPI = {
  async testConnection(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/test-connection`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  async getVolumes(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/volumes`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  async deleteVolume(nodeId, name) {
    const response = await fetch(`/api/forward/${nodeId}/docker/volumes/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      let msg = `HTTP ${response.status}`
      try {
        const data = await response.json()
        if (data.message) {
          msg = data.message
          if (data.error) msg += ': ' + data.error
        }
      } catch { /* ignore */ }
      throw new Error(msg)
    }
    return response.json()
  }
}

// 加载存储卷列表
const loadVolumes = async () => {
  if (!currentNodeId.value) return

  loading.value = true
  try {
    const connectionTest = await dockerAPI.testConnection(currentNodeId.value)
    if (!connectionTest.success) {
      throw new Error(connectionTest.message || 'Docker连接失败')
    }

    const response = await dockerAPI.getVolumes(currentNodeId.value)
    if (response.success) {
      volumeList.value = (response.data || []).map((v) => ({
        ...v,
        sizeDisplay: formatSize(v.usage?.size || 0),
        createdTime: formatDate(v.created)
      }))
    } else {
      throw new Error(response.message || '获取存储卷列表失败')
    }
  } catch (err) {
    ElMessage.error(err.message)
    volumeList.value = []
  } finally {
    loading.value = false
  }
}

// 节点选择
const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  loadVolumes()
}

const handleNodeError = (errorMsg) => {
  ElMessage.error(`节点错误: ${errorMsg}`)
  volumeList.value = []
}

// 打开详情
const openVolumeDetail = (vol) => {
  selectedVolumeName.value = vol.name
  showDetailModal.value = true
}

// 删除存储卷
const deleteVolume = async (vol) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除存储卷 "${vol.name}" 吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const response = await dockerAPI.deleteVolume(currentNodeId.value, vol.name)
    if (response.success) {
      ElNotification({
        title: '成功',
        message: '存储卷删除成功',
        type: 'success',
        duration: 3000
      })
      await loadVolumes()
    } else {
      let errorMessage = response.message || '删除失败'
      if (response.error) {
        errorMessage += ': ' + response.error
      }
      throw new Error(errorMessage)
    }
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '删除存储卷失败')
    }
  }
}

// 辅助函数
const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx++
  }
  return `${size.toFixed(2)} ${units[idx]}`
}

const formatDate = (isoOrTimestamp) => {
  if (!isoOrTimestamp) return '-'
  try {
    const d = new Date(isoOrTimestamp)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '-'
  }
}
</script>

<style scoped>
.volume-manage-page {
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
