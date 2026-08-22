<template>
  <div class="image-manage-page">
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
          placeholder="搜索镜像ID或标签..."
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
          <el-button :icon="Refresh" @click="loadImages" :loading="loading">刷新</el-button>
          <el-button type="primary" :icon="Download" @click="showPullImageModal" :disabled="!currentNodeId">拉取镜像</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 镜像列表表格 -->
    <div class="table-container" v-loading="loading" element-loading-text="加载镜像列表中...">
      <el-table :data="filteredImages" style="width: 100%" border stripe>
        <el-table-column prop="id" label="ID" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="font-monospace">{{ row.shortId }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.inUse ? 'success' : 'info'">
              {{ row.inUse ? '使用中' : '未使用' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="tag" label="标签" min-width="200" show-overflow-tooltip />

        <el-table-column prop="size" label="大小" width="120" align="right" />

        <el-table-column prop="createdTime" label="创建时间" width="180" align="center" />

        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="showImageDetail(row)">详情</el-button>
            <el-button
              link
              type="danger"
              @click="deleteImage(row)"
              :disabled="row.inUse"
              :title="row.inUse ? '正在使用的镜像无法删除' : '删除镜像'"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 拉取镜像弹窗 -->
    <PullImageModal
      v-model="showPullModal"
      :node-id="currentNodeId"
      @success="onPullSuccess"
    />

    <!-- 镜像详情弹窗 -->
    <ImageDetailModal
      v-if="showDetailModal"
      v-model="showDetailModal"
      :node-id="currentNodeId"
      :image-id="selectedImageId"
    />

    <!-- 删除镜像弹窗 -->
    <DeleteImageModal
      v-model="showDeleteModal"
      :node-id="currentNodeId"
      :image-id="deleteTargetId"
      :image-tag="deleteTargetTag"
      @success="onDeleteSuccess"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import PullImageModal from './image/PullImageModal.vue'
import ImageDetailModal from './image/ImageDetailModal.vue'
import DeleteImageModal from './image/DeleteImageModal.vue'

// 状态
const currentNodeId = ref('')
const imageList = ref([])
const searchQuery = ref('')
const loading = ref(false)

// 弹窗状态
const showPullModal = ref(false)
const showDetailModal = ref(false)
const selectedImageId = ref('')
const showDeleteModal = ref(false)
const deleteTargetId = ref('')
const deleteTargetTag = ref('')

// 过滤后的镜像列表
const filteredImages = computed(() => {
  let images = imageList.value

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    images = images.filter(
      (image) => image.tag.toLowerCase().includes(query) || image.id.toLowerCase().includes(query),
    )
  }

  return images
})

// Docker API 封装
const dockerAPI = {
  // 测试Docker连接
  async testConnection(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/test-connection`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },

  // 获取镜像列表
  async getImages(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/images`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
}

// 节点选择处理
const handleNodeSelected = async (node) => {
  currentNodeId.value = node.id
  await loadImages()
}

// 节点错误处理
const handleNodeError = (errorMsg) => {
  ElMessage.error(`节点选择错误: ${errorMsg}`)
  imageList.value = []
}

// 加载镜像列表
const loadImages = async () => {
  if (!currentNodeId.value) return

  loading.value = true

  try {
    // 测试Docker连接
    const connectionTest = await dockerAPI.testConnection(currentNodeId.value)
    if (!connectionTest.success) {
      ElMessage.error(`Docker连接失败: ${connectionTest.message || '未知错误'}`)
      throw new Error(connectionTest.message || 'Docker连接测试失败')
    }

    // 获取镜像列表
    const response = await dockerAPI.getImages(currentNodeId.value)
    if (!response.success) {
      ElMessage.error(`获取镜像列表失败: ${response.message || '未知错误'}`)
      throw new Error(response.message || '获取镜像列表失败')
    }

    // 处理镜像数据
    imageList.value = (response.data || []).map((image) => {
      const id = image.id || image.Id || image.ID || 'unknown'
      return {
        id: id,
        shortId: id.startsWith('sha256:') ? id.substring(7, 19) : id.substring(0, 12),
        tag: image.repoTags?.[0] || image.RepoTags?.[0] || image.tag || '<none>:<none>',
        size: formatSize(image.size || image.Size || 0),
        createdTime: formatDate(image.created || image.Created || Date.now()),
        inUse: image.containers > 0 || image.inUse || false,
      }
    })

    if (imageList.value.length === 0) {
      ElMessage.info('节点docker连接成功，但没有找到容器镜像')
    }
  } catch (err) {
    // 只有在不是我们主动抛出的错误时才显示通用错误消息
    if (!err.message.includes('Docker连接测试失败') && !err.message.includes('获取镜像列表失败')) {
      ElMessage.error(`加载镜像失败: ${err.message}`)
    }
    imageList.value = []
    console.error('加载镜像失败:', err)
  } finally {
    loading.value = false
  }
}

// 显示拉取镜像弹窗
const showPullImageModal = () => {
  if (!currentNodeId.value) {
    ElMessage.warning('请先选择一个节点')
    return
  }
  showPullModal.value = true
}

// 显示镜像详情
const showImageDetail = (image) => {
  // 确保使用完整的镜像ID
  const imageId = image.id.startsWith('sha256:') ? image.id : `sha256:${image.id}`
  selectedImageId.value = imageId
  showDetailModal.value = true
}

// 删除镜像
const deleteImage = (image) => {
  if (image.inUse) {
    ElMessage.warning('正在使用的镜像无法删除')
    return
  }
  deleteTargetId.value = image.id
  deleteTargetTag.value = image.tag
  showDeleteModal.value = true
}

// 回调处理
const onPullSuccess = () => {
  ElMessage.success('镜像拉取任务提交成功')
  loadImages()
}

const onDeleteSuccess = () => {
  ElMessage.success('镜像删除成功')
  loadImages()
}

// 工具函数
const formatSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (timestamp) => {
  const date = new Date(timestamp * 1000 || timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.image-manage-page {
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

.font-monospace {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
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
