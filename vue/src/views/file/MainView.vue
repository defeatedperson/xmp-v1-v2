<template>
  <div class="file-main">
    <FileToolbar
      :transfer-visible="showTransferArea"
      @node-selected="handleNodeSelected"
      @search="handleSearch"
      @refresh="handleRefresh"
      @batch="openBatch"
      @create="openCreate"
      @upload="openUpload"
      @transfer="toggleTransferArea"
    />
    <FileTransferArea
      ref="transferAreaRef"
      :visible="showTransferArea"
      @transfer-loading-change="handleTransferLoadingChange"
      @transfer-progress-change="handleTransferProgressChange"
    />
    <div v-if="transferOverlayVisible" class="transfer-global-overlay">
      <div class="transfer-global-card">
        <!-- 头部：状态与图标 -->
        <div class="card-header">
          <div class="status-badge">
            <el-icon class="spinning-icon"><Loading /></el-icon>
            <span>{{ transferPollMessage }}</span>
          </div>
          <span class="progress-count">
            {{ transferOverlayProgress.currentIndex }} / {{ transferOverlayProgress.totalCount }}
          </span>
        </div>

        <!-- 主体：文件与进度 -->
        <div class="card-body">
          <div class="current-file" :title="transferOverlayProgress.currentFileName">
            {{ transferOverlayProgress.currentFileName || '准备中...' }}
          </div>

          <div class="progress-section">
            <el-progress
              :percentage="transferProgressPercent"
              :stroke-width="8"
              :show-text="false"
              status="success"
              class="custom-progress"
            />
            <div class="progress-meta">
              <span class="meta-item success">成功: {{ transferOverlayProgress.successCount }}</span>
              <span class="meta-item error">失败: {{ transferOverlayProgress.errorCount }}</span>
              <span class="meta-percent">{{ transferProgressPercent }}%</span>
            </div>
          </div>

          <div v-if="transferOverlayProgress.message" class="status-message">
             {{ transferOverlayProgress.message }}
          </div>
        </div>

        <!-- 底部：提示与操作 -->
        <div class="card-footer">
          <div class="warning-text">请保持页面开启，不要刷新</div>
          <el-button type="danger" plain size="small" round @click="cancelTransferFromOverlay">
            中断传输
          </el-button>
        </div>
      </div>
    </div>
    <FileList
      :files="files"
      :loading="loading"
      :error="error"
      :current-path="currentPath"
      :search-query="searchQuery"
      @navigate="handleNavigate"
      @action="handleAction"
      @selection-change="handleSelectionChange"
    />
    <FileCreateModal
      v-model:visible="showCreateModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      @created="handleCreated"
    />
    <FileDeleteModal
      v-model:visible="showDeleteModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      :file="currentTargetFile"
      @deleted="handleDeleted"
    />
    <FileCompressModal
      v-model:visible="showCompressModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      :file="currentCompressFile"
      @compressed="handleCompressed"
    />
    <FileDecompressModal
      v-model:visible="showDecompressModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      :file="currentDecompressFile"
      @decompressed="handleDecompressed"
    />
    <FileViewModal
      :is-visible="showFileViewModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      :file-name="currentViewFile?.name || ''"
      :file-data="currentViewFile"
      @close="handleFileViewClose"
      @file-updated="handleFileUpdated"
    />
    <FileDownloadModal
      v-model:visible="showDownloadModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      :file="currentDownloadFile"
      @downloaded="handleDownloaded"
    />
    <FileUploadModal
      v-model:visible="showUploadModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      @uploaded="handleUploaded"
    />
    <FileRenameModal
      v-model:visible="showRenameModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      :file="currentRenameFile"
      @renamed="handleRenamed"
    />
    <FilePermissionModal
      v-model:visible="showPermissionModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      :file="currentPermissionFile"
      @permission-updated="handlePermissionUpdated"
    />
    <FileBatchOperationModal
      v-model:visible="showBatchModal"
      :node-id="currentNodeId"
      :current-path="currentPath"
      :selected-files="selectedFiles"
      @deleted="handleBatchDeleted"
      @transferred="handleBatchTransferred"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import FileToolbar from './child/FileToolbar.vue'
import FileList from './child/FileList.vue'
import { fetchFileList } from './tools/fileListTool'
import { pickFileIdentity } from './tools/fileListTool'
import FileTransferArea from './child/FileTransferArea.vue'
import FileCreateModal from './modal/FileCreateModal.vue'
import FileDeleteModal from './modal/FileDeleteModal.vue'
import FileCompressModal from './modal/FileCompressModal.vue'
import FileDecompressModal from './modal/FileDecompressModal.vue'
import FileViewModal from './modal/FileViewModal.vue'
import FileDownloadModal from './modal/FileDownloadModal.vue'
import FileUploadModal from './modal/FileUploadModal.vue'
import FileRenameModal from './modal/FileRenameModal.vue'
import FilePermissionModal from './modal/FilePermissionModal.vue'
import FileBatchOperationModal from './modal/FileBatchOperationModal.vue'
import { isArchiveFile } from './tools/fileListUtils'
import { TransferStorage } from './tools/transferStorage'
import { transferEventBus, TRANSFER_EVENTS } from './tools/transferEventBus'

const currentNodeId = ref('')
const currentPath = ref('/')
const searchQuery = ref('')
const files = ref([])
const loading = ref(false)
const error = ref('')
const showTransferArea = ref(false)
const showCreateModal = ref(false)
const showDeleteModal = ref(false)
const showCompressModal = ref(false)
const showDecompressModal = ref(false)
const showFileViewModal = ref(false)
const showDownloadModal = ref(false)
const showUploadModal = ref(false)
const showRenameModal = ref(false)
const showPermissionModal = ref(false)
const showBatchModal = ref(false)
const transferOverlayVisible = ref(false)
const transferOverlayProgress = ref({
  currentIndex: 0,
  totalCount: 0,
  currentFileName: '',
  successCount: 0,
  errorCount: 0,
  message: '',
})
const transferPollCount = ref(0)
const transferPollTimer = ref(null)

const transferPollMessage = computed(() => {
  const messages = [
    '🚀 正在加速传输中...',
    '✅ 连接稳定，正在加速...',
    '📦 正在搬运数据，请稍候...',
    '📂 正在处理文件流...',
    '⏳ 文件有点大，请耐心等待...',
    '🔥 马上就好啦...',
    '💪 正在努力传输中...',
  ]
  return messages[transferPollCount.value % messages.length]
})

watch(transferOverlayVisible, (val) => {
  if (val) {
    transferPollCount.value = 0
    if (transferPollTimer.value) clearInterval(transferPollTimer.value)
    transferPollTimer.value = setInterval(() => {
      transferPollCount.value += 1
    }, 3000)
  } else {
    if (transferPollTimer.value) {
      clearInterval(transferPollTimer.value)
      transferPollTimer.value = null
    }
    transferPollCount.value = 0
  }
})
const transferAreaRef = ref(null)
const currentTargetFile = ref(null)
const currentCompressFile = ref(null)
const currentDecompressFile = ref(null)
const currentViewFile = ref(null)
const currentDownloadFile = ref(null)
const currentRenameFile = ref(null)
const currentPermissionFile = ref(null)
const selectedFileKeys = ref([])

const route = useRoute()
const router = useRouter()

const hasControlChars = (value) => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code >= 0 && code <= 31) return true
  }
  return false
}

const parsePathFromQuery = (value) => {
  const raw = Array.isArray(value) ? value[0] : value
  const rawStr = String(raw ?? '').trim()
  if (!rawStr) return { path: '/', sanitized: false, hasRaw: false }
  let decoded = rawStr
  try {
    decoded = decodeURIComponent(rawStr)
  } catch {
    decoded = rawStr
  }
  const hasInvalid =
    decoded.includes('..') ||
    decoded.includes('\\') ||
    /%2e/i.test(rawStr) ||
    /%5c/i.test(rawStr) ||
    hasControlChars(decoded)
  if (hasInvalid) return { path: '/', sanitized: true, hasRaw: true }
  let next = decoded
  if (!next.startsWith('/')) next = `/${next}`
  next = next.replace(/\/+/g, '/')
  if (next.length > 1) next = next.replace(/\/+$/, '')
  const sanitized = next !== rawStr
  return { path: next, sanitized, hasRaw: true }
}

const setPathToUrl = (path, replace = true) => {
  const normalized = parsePathFromQuery(path).path
  const current = parsePathFromQuery(route.query.path).path
  const hasQueryPath = Object.prototype.hasOwnProperty.call(route.query, 'path')
  if (
    normalized === current &&
    ((normalized === '/' && !hasQueryPath) || route.query.path === normalized)
  ) {
    return
  }
  const nextQuery = { ...route.query }
  if (normalized === '/') {
    delete nextQuery.path
  } else {
    nextQuery.path = normalized
  }
  const action = replace ? router.replace : router.push
  action.call(router, { query: nextQuery })
}

const initialPath = parsePathFromQuery(route.query.path)
currentPath.value = initialPath.path
if (initialPath.sanitized) {
  setPathToUrl(initialPath.path, true)
}

const loadFiles = async () => {
  if (!currentNodeId.value) {
    files.value = []
    return
  }
  loading.value = true
  error.value = ''
  const result = await fetchFileList({
    nodeId: currentNodeId.value,
    path: currentPath.value,
    search: searchQuery.value,
  })
  loading.value = false
  if (!result.success) {
    error.value = result.message || '加载失败'
    files.value = []
    return
  }
  currentPath.value = result.currentPath || currentPath.value
  setPathToUrl(currentPath.value, true)
  files.value = Array.isArray(result.data) ? result.data : []
  selectedFileKeys.value = []
  transferEventBus.emit(TRANSFER_EVENTS.CURRENT_PATH_CHANGED, {
    path: currentPath.value,
    pathSegments: [],
  })
}

const getFileKey = (file) => String(file?.relativePath || file?.name || '')

const selectedFiles = computed(() => {
  const map = new Map(files.value.map((file) => [getFileKey(file), file]))
  return selectedFileKeys.value.map((key) => map.get(key)).filter(Boolean)
})

const handleNodeSelected = (node) => {
  const nextNodeId = node?.id ? String(node.id) : ''
  const isInitialSelect = !currentNodeId.value
  currentNodeId.value = nextNodeId
  if (isInitialSelect) {
    const parsed = parsePathFromQuery(route.query.path)
    currentPath.value = parsed.path || '/'
    if (parsed.sanitized) setPathToUrl(currentPath.value, true)
  } else {
    currentPath.value = '/'
    setPathToUrl(currentPath.value, true)
  }
  selectedFileKeys.value = []
  transferEventBus.emit(TRANSFER_EVENTS.CURRENT_NODE_CHANGED, {
    nodeId: currentNodeId.value,
    nodeName: node?.name || node?.remark || '',
    nodeData: node || null,
  })
  loadFiles()
}

const handleSearch = (query) => {
  searchQuery.value = String(query || '')
  loadFiles()
}

const handleRefresh = () => {
  loadFiles()
}

const handleSelectionChange = (keys) => {
  selectedFileKeys.value = Array.isArray(keys) ? keys : []
}

const transferProgressPercent = computed(() => {
  if (!transferOverlayProgress.value.totalCount) return 0
  return Math.round(
    (transferOverlayProgress.value.currentIndex / transferOverlayProgress.value.totalCount) * 100,
  )
})

const handleTransferLoadingChange = (val) => {
  transferOverlayVisible.value = Boolean(val)
}

const handleTransferProgressChange = (progress) => {
  transferOverlayProgress.value = {
    ...transferOverlayProgress.value,
    ...progress,
  }
}

const cancelTransferFromOverlay = () => {
  transferAreaRef.value?.cancelTransfer?.()
}

const handleTransferRefreshRequired = () => {
  loadFiles()
}

const handleNavigate = (path) => {
  currentPath.value = path || '/'
  setPathToUrl(currentPath.value, false)
  transferEventBus.emit(TRANSFER_EVENTS.CURRENT_PATH_CHANGED, {
    path: currentPath.value,
    pathSegments: [],
  })
  loadFiles()
}

const openCreate = () => {
  if (!currentNodeId.value) {
    error.value = '请选择节点'
    return
  }
  showCreateModal.value = true
}

const openUpload = () => {
  if (!currentNodeId.value) {
    error.value = '请选择节点'
    return
  }
  showUploadModal.value = true
}

const toggleTransferArea = () => {
  if (!currentNodeId.value) {
    error.value = '请选择节点'
    return
  }
  showTransferArea.value = !showTransferArea.value
}

const openBatch = () => {
  if (!currentNodeId.value) {
    error.value = '请选择节点'
    return
  }
  if (selectedFiles.value.length === 0) {
    ElMessage.warning('请先选择要操作的文件')
    return
  }
  showBatchModal.value = true
}

const handleCreated = () => {
  loadFiles()
}

const handleAction = ({ action, file }) => {
  if (action === 'delete') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    currentTargetFile.value = file
    showDeleteModal.value = true
  }
  if (action === 'compress') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    currentCompressFile.value = file
    showCompressModal.value = true
  }
  if (action === 'decompress') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    currentDecompressFile.value = file
    showDecompressModal.value = true
  }
  if (action === 'open') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    if (isArchiveFile(file)) {
      currentDecompressFile.value = file
      showDecompressModal.value = true
      return
    }
    currentViewFile.value = file
    showFileViewModal.value = true
  }
  if (action === 'edit') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    currentViewFile.value = file
    showFileViewModal.value = true
  }
  if (action === 'download') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    currentDownloadFile.value = file
    showDownloadModal.value = true
  }
  if (action === 'rename') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    currentRenameFile.value = file
    showRenameModal.value = true
  }
  if (action === 'permission') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    currentPermissionFile.value = file
    showPermissionModal.value = true
  }
  if (action === 'transfer') {
    if (!currentNodeId.value) {
      error.value = '请选择节点'
      return
    }
    const ident = pickFileIdentity(currentNodeId.value, file)
    const rawName = String(file?.name || '').trim()
    const pathBase = String(currentPath.value || '/')
    const computedRelativePath = ident.relativePath
      ? String(ident.relativePath)
      : rawName
        ? `${pathBase === '/' ? '' : pathBase}/${rawName}`
        : ''
    const id = TransferStorage.generateId()
    const name = rawName || String(computedRelativePath || '').split('/').pop()
    const item = {
      id,
      nodeId: String(ident.nodeId || ''),
      relativePath: computedRelativePath,
      type: String(ident.type || ''),
      name,
      transferStatus: 'pending',
      addedAt: Date.now(),
    }
    const ok = TransferStorage.addItems([item])
    if (!ok) {
      ElMessage.error('添加到中转站失败')
      return
    }
    transferEventBus.emit(TRANSFER_EVENTS.ITEMS_ADDED, { item })
    showTransferArea.value = true
    ElMessage.success('已添加到中转站')
  }
}

const handleDeleted = () => {
  currentTargetFile.value = null
  loadFiles()
}

const handleCompressed = () => {
  currentCompressFile.value = null
  loadFiles()
}

const handleDecompressed = () => {
  currentDecompressFile.value = null
  loadFiles()
}

const handleFileViewClose = () => {
  showFileViewModal.value = false
  currentViewFile.value = null
}

const handleFileUpdated = () => {
  loadFiles()
}

const handleDownloaded = () => {
  currentDownloadFile.value = null
}

const handleUploaded = () => {
  loadFiles()
}

const handleRenamed = () => {
  currentRenameFile.value = null
  loadFiles()
}

const handlePermissionUpdated = () => {
  currentPermissionFile.value = null
  loadFiles()
}

const handleBatchDeleted = () => {
  selectedFileKeys.value = []
  loadFiles()
}

const handleBatchTransferred = () => {
  showTransferArea.value = true
}

onMounted(() => {
  watch(
    () => route.query.path,
    (val) => {
      const parsed = parsePathFromQuery(val)
      const nextPath = parsed.path
      if (parsed.sanitized) setPathToUrl(nextPath, true)
      if (nextPath === currentPath.value) return
      currentPath.value = nextPath
      if (currentNodeId.value) {
        loadFiles()
      }
    },
  )
  transferEventBus.on(TRANSFER_EVENTS.REFRESH_REQUIRED, handleTransferRefreshRequired)
})

onUnmounted(() => {
  transferEventBus.off(TRANSFER_EVENTS.REFRESH_REQUIRED, handleTransferRefreshRequired)
})

</script>

<style scoped>
.file-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

/* 遮罩层：增加模糊和深色背景 */
.transfer-global-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

/* 卡片：更现代的阴影和圆角 */
.transfer-global-card {
  background: var(--el-bg-color);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  padding: 24px;
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  border: 1px solid var(--el-border-color-light);
}

/* 头部布局 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.spinning-icon {
  animation: rotate 1.5s linear infinite;
  color: var(--el-color-primary);
}

.progress-count {
  font-family: monospace;
  background: var(--el-fill-color-dark);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 主体内容 */
.card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.current-file {
  font-size: 14px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  font-weight: 500;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-item.success { color: var(--el-color-success); }
.meta-item.error { color: var(--el-color-danger); }

.status-message {
  color: var(--el-color-primary);
  font-size: 13px;
  text-align: center;
  min-height: 20px;
}

/* 底部布局 */
.card-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 16px;
}

.warning-text {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
