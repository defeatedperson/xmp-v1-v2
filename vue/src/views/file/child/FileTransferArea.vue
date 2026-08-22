<template>
  <div v-if="visible" class="file-transfer-area">
    <div class="transfer-header">
      <div class="header-left">
        <i class="fas fa-exchange-alt transfer-icon"></i>
        <span class="transfer-title">文件中转站</span>
        <span v-if="transferCount > 0" class="transfer-count">({{ transferCount }})</span>
      </div>
      <div class="header-right">
        <el-radio-group
          v-if="!hasCrossNodeItems"
          v-model="transferMode"
          size="small"
          @change="setMode"
        >
          <el-radio-button label="move">移动</el-radio-button>
          <el-radio-button label="copy">复制</el-radio-button>
        </el-radio-group>
        <el-button v-if="transferCount > 0" size="small" @click="clearTransfer">清空</el-button>
      </div>
    </div>
    <div class="transfer-content">
      <el-empty v-if="transferCount === 0" :image-size="60">
        <template #description>
          <div class="empty-text">中转站为空</div>
        </template>
      </el-empty>

      <div v-else class="transfer-container">
        <div class="operation-area">
          <div class="location-summary">
            <i class="fas fa-map-marker-alt"></i>
            <span class="location-label">当前路径：</span>
            <span class="location-value">{{ currentLocationText }}</span>
          </div>
          <div class="operation-buttons">
            <el-button size="small" @click="toggleSelectAll">
              全选
              <span v-if="selectedCount > 0" class="selected-count">
                ({{ selectedCount }}/{{ transferCount }})
              </span>
            </el-button>
            <el-button size="small" :disabled="selectedCount === 0" @click="removeSelectedItems">
              删除选中
            </el-button>
            <el-button
              size="small"
              :disabled="isTransferring || failedCount === 0"
              @click="retryFailedItems"
            >
              重试失败
            </el-button>
            <el-button
              size="small"
              type="primary"
              :disabled="selectedCount === 0 || isTransferring"
              @click="sendToCurrentPath"
            >
              发送到此处
            </el-button>
          </div>
        </div>

        <el-table
          ref="tableRef"
          class="transfer-table"
          :data="tableRows"
          row-key="id"
          :max-height="360"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="48" />
          <el-table-column label="节点信息" min-width="140">
            <template #default="{ row }">
              <span>{{ row.nodeLabel }}</span>
            </template>
          </el-table-column>
          <el-table-column label="文件名" min-width="160">
            <template #default="{ row }">
              <i :class="row.isFolder ? 'fas fa-folder' : 'fas fa-file'"></i>
              <span class="table-file-name">{{ row.fileName }}</span>
            </template>
          </el-table-column>
          <el-table-column label="文件路径" min-width="220">
            <template #default="{ row }">
              <span class="table-file-path">{{ row.filePath }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="row.statusType" size="small">{{ row.statusText }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button text size="small" @click="removeItem(row.id)">移除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <el-alert
        class="transfer-tips"
        type="info"
        :closable="false"
        show-icon
        title="传输提示"
        :description="tipsText"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { transferEventBus, TRANSFER_EVENTS } from '../tools/transferEventBus'
import { TransferStorage, TRANSFER_STATUS } from '../tools/transferStorage'
import { moveEntry, copyEntrySameNode, crossNodeCopy } from '../tools/fileTransferTool'
import { normalizeRelativePath } from '../tools/fileCreateTool'

const emit = defineEmits(['transfer-loading-change', 'transfer-progress-change'])

defineProps({
  visible: { type: Boolean, default: true },
})

const transferMode = ref('move')
const transferItems = ref([])
const selectedItems = ref([])
const isTransferring = ref(false)
const isCancelled = ref(false)
const currentNodeInfo = ref({ nodeId: null, nodeName: '', nodeData: null })
const currentPathInfo = ref({ path: '/', pathSegments: [] })
const transferProgress = ref({
  currentIndex: 0,
  totalCount: 0,
  currentFileName: '',
  successCount: 0,
  errorCount: 0,
  message: '',
})

const transferCount = computed(() => transferItems.value.length)
const selectedCount = computed(() => selectedItems.value.length)
const failedCount = computed(
  () => transferItems.value.filter((item) => item.transferStatus === TRANSFER_STATUS.ERROR).length,
)
const modeText = computed(() => (transferMode.value === 'move' ? '移动模式' : '复制模式'))
const tipsText = computed(() => {
  if (hasCrossNodeItems.value) {
    return '检测到跨节点传输，已强制使用复制模式，选择文件后点击“发送到此处”进行传输'
  }
  return `当前模式：${modeText.value}，选择文件后点击“发送到此处”进行传输`
})
const isAllSelected = computed(
  () => transferItems.value.length > 0 && selectedItems.value.length === transferItems.value.length,
)
const hasCrossNodeItems = computed(() => {
  if (!currentNodeInfo.value.nodeId || transferItems.value.length === 0) return false
  return transferItems.value.some((item) => item.nodeId !== currentNodeInfo.value.nodeId)
})

const tableRows = computed(() =>
  transferItems.value.map((item) => {
    const filePath = String(item.relativePath || '')
    const fileName = getFileName(filePath)
    const nodeLabel = item.nodeName ? `${item.nodeName} ${item.nodeId}` : `节点${item.nodeId}`
    const statusText =
      item.transferStatus === TRANSFER_STATUS.SUCCESS
        ? '成功'
        : item.transferStatus === TRANSFER_STATUS.ERROR
          ? '失败'
          : '等待'
    const statusType =
      item.transferStatus === TRANSFER_STATUS.SUCCESS
        ? 'success'
        : item.transferStatus === TRANSFER_STATUS.ERROR
          ? 'danger'
          : 'info'
    return {
      ...item,
      nodeLabel,
      fileName,
      filePath,
      statusText,
      statusType,
      isFolder: item.type === 'folder' || item.type === 'directory',
    }
  }),
)

const currentLocationText = computed(() => {
  const nodeName = currentNodeInfo.value.nodeName || '未选择节点'
  const nodeId = currentNodeInfo.value.nodeId ? ` ${currentNodeInfo.value.nodeId}` : ''
  const path = currentPathInfo.value.path && currentPathInfo.value.path !== '/' ? currentPathInfo.value.path : ''
  return `${nodeName}${nodeId}${path}`
})

const tableRef = ref(null)

watch(hasCrossNodeItems, (val) => {
  if (val) transferMode.value = 'copy'
})

const syncTableSelection = async () => {
  await nextTick()
  if (!tableRef.value) return
  tableRef.value.clearSelection()
  const selectedSet = new Set(selectedItems.value)
  tableRows.value.forEach((row) => {
    if (selectedSet.has(row.id)) {
      tableRef.value.toggleRowSelection(row, true)
    }
  })
}

const loadTransferItems = async () => {
  const data = TransferStorage.getItems()
  transferItems.value = (data.items || []).map((item) => ({
    ...item,
    transferStatus: item.transferStatus || TRANSFER_STATUS.PENDING,
  }))
  const validIds = new Set(transferItems.value.map((item) => item.id))
  selectedItems.value = selectedItems.value.filter((id) => validIds.has(id))
  await syncTableSelection()
}


const setMode = (mode) => {
  if (hasCrossNodeItems.value && mode === 'move') {
    transferMode.value = 'copy'
    return
  }
  transferMode.value = mode
}

const clearTransfer = () => {
  transferItems.value = []
  selectedItems.value = []
  TransferStorage.clearAll()
  transferEventBus.emit(TRANSFER_EVENTS.CLEAR_ALL)
}

const removeItem = (itemId) => {
  const index = transferItems.value.findIndex((item) => item.id === itemId)
  if (index !== -1) {
    transferItems.value.splice(index, 1)
    selectedItems.value = selectedItems.value.filter((id) => id !== itemId)
    TransferStorage.removeItems([itemId])
    transferEventBus.emit(TRANSFER_EVENTS.ITEMS_REMOVED, { itemId })
  }
}

const toggleSelectAll = async () => {
  if (!tableRef.value) return
  if (isAllSelected.value) {
    tableRef.value.clearSelection()
    selectedItems.value = []
    return
  }
  tableRef.value.toggleAllSelection()
  await nextTick()
}

const removeSelectedItems = () => {
  if (!selectedItems.value.length) return
  const ids = [...selectedItems.value]
  transferItems.value = transferItems.value.filter((item) => !ids.includes(item.id))
  selectedItems.value = []
  TransferStorage.removeItems(ids)
  transferEventBus.emit(TRANSFER_EVENTS.ITEMS_REMOVED, { itemIds: ids, count: ids.length })
}

const retryFailedItems = async () => {
  if (isTransferring.value) return
  const failedIds = transferItems.value
    .filter((item) => item.transferStatus === TRANSFER_STATUS.ERROR)
    .map((item) => item.id)
  if (!failedIds.length) return
  selectedItems.value = failedIds
  await syncTableSelection()
  transferFiles()
}

const sendToCurrentPath = () => {
  if (!selectedItems.value.length) {
    ElMessage.warning('请先选择要传输的文件')
    return
  }
  transferFiles()
}

const updateLocalStatus = (itemId, status) => {
  const index = transferItems.value.findIndex((item) => item.id === itemId)
  if (index === -1) return
  transferItems.value[index] = {
    ...transferItems.value[index],
    transferStatus: status,
  }
}

const updateItemStatus = (itemId, status, emitEvent = false) => {
  TransferStorage.updateItemStatus(itemId, status)
  updateLocalStatus(itemId, status)
  if (emitEvent) {
    transferEventBus.emit(TRANSFER_EVENTS.STATUS_UPDATED, { itemId, status })
  }
}

const executeFileTransfer = async (item) => {
  if (isCancelled.value) return { cancelled: true }
  updateItemStatus(item.id, TRANSFER_STATUS.PENDING)
  const targetNodeId = currentNodeInfo.value.nodeId
  if (!targetNodeId) return { success: false, message: '未选择目标节点' }
  if (item.nodeId !== targetNodeId) {
    const result = await crossNodeCopy({
      sourceNodeId: item.nodeId,
      targetNodeId,
      itemRelativePath: item.relativePath,
      itemType: item.type,
      targetPath: currentPathInfo.value.path,
      onProgress: (msg) => {
        transferProgress.value.message = msg
      },
    })
    updateItemStatus(item.id, result.success ? TRANSFER_STATUS.SUCCESS : TRANSFER_STATUS.ERROR)
    return result
  }
  const raw = String(item.relativePath || '').trim()
  const sourcePath = raw ? raw.replace(/^\/+/, '') : String(item.name || '').trim()
  const destPath = normalizeRelativePath(currentPathInfo.value.path)
  if (transferMode.value === 'move') {
    const result = await moveEntry({ nodeId: targetNodeId, sourcePath, destPath })
    updateItemStatus(item.id, result.success ? TRANSFER_STATUS.SUCCESS : TRANSFER_STATUS.ERROR)
    return result
  }
  const result = await copyEntrySameNode({ nodeId: targetNodeId, sourcePath, destPath })
  updateItemStatus(item.id, result.success ? TRANSFER_STATUS.SUCCESS : TRANSFER_STATUS.ERROR)
  return result
}

const transferFiles = async () => {
  if (!selectedItems.value.length) return
  isTransferring.value = true
  isCancelled.value = false
  let wasCancelled = false
  try {
    const targetNodeId = currentNodeInfo.value.nodeId
    if (!targetNodeId) {
      ElMessage.error('未选择目标节点')
      return
    }
    const itemsToTransfer = transferItems.value.filter((item) => selectedItems.value.includes(item.id))
    if (!itemsToTransfer.length) return
    transferProgress.value = {
      currentIndex: 0,
      totalCount: itemsToTransfer.length,
      currentFileName: '',
      successCount: 0,
      errorCount: 0,
      message: '',
    }
    let successCount = 0
    let errorCount = 0
    const successIds = []
    for (let i = 0; i < itemsToTransfer.length; i++) {
      if (isCancelled.value) {
        wasCancelled = true
        break
      }
      const item = itemsToTransfer[i]
      transferProgress.value.currentIndex = i + 1
      transferProgress.value.currentFileName = getFileName(item.relativePath)
      const result = await executeFileTransfer(item)
      if (isCancelled.value || result?.cancelled) {
        wasCancelled = true
        break
      }
      if (result.success) {
        successCount += 1
        transferProgress.value.successCount = successCount
        if (transferMode.value === 'move') {
          successIds.push(item.id)
        }
      } else {
        errorCount += 1
        transferProgress.value.errorCount = errorCount
        ElMessage.error(result.message || '传输失败')
      }
    }
    if (transferMode.value === 'move' && successIds.length > 0) {
      transferItems.value = transferItems.value.filter((item) => !successIds.includes(item.id))
      selectedItems.value = selectedItems.value.filter((id) => !successIds.includes(id))
      TransferStorage.removeItems(successIds)
      transferEventBus.emit(TRANSFER_EVENTS.ITEMS_REMOVED, {
        itemIds: successIds,
        count: successIds.length,
      })
    }
    if (!wasCancelled && (successCount > 0 || errorCount > 0)) {
      ElMessage.success(`传输完成: 成功 ${successCount} 个, 失败 ${errorCount} 个`)
    }
    if (itemsToTransfer.length > 0) {
      transferEventBus.emit(TRANSFER_EVENTS.BATCH_STATUS_UPDATED, {
        successCount,
        errorCount,
        totalCount: itemsToTransfer.length,
      })
      transferEventBus.emit(TRANSFER_EVENTS.REFRESH_REQUIRED)
    }
  } finally {
    isTransferring.value = false
    transferProgress.value = {
      currentIndex: 0,
      totalCount: 0,
      currentFileName: '',
      successCount: 0,
      errorCount: 0,
      message: '',
    }
  }
}

const cancelTransfer = () => {
  if (!isTransferring.value) return
  isCancelled.value = true
  isTransferring.value = false
  transferProgress.value = {
    currentIndex: 0,
    totalCount: 0,
    currentFileName: '',
    successCount: 0,
    errorCount: 0,
    message: '',
  }
  ElMessage.warning('已中断前端传输，后台任务仍在执行，可前往任务中心查看')
}

const getFileName = (relativePath) => {
  if (!relativePath) return '未知文件'
  const parts = String(relativePath).split('/')
  return parts[parts.length - 1] || '未知文件'
}

const handleSelectionChange = (rows) => {
  selectedItems.value = rows.map((row) => row.id)
}

const handleItemsAdded = () => loadTransferItems()
const handleItemsRemoved = () => loadTransferItems()
const handleRefreshRequired = () => loadTransferItems()
const handleStatusUpdated = () => loadTransferItems()
const handleBatchStatusUpdated = () => loadTransferItems()

const handleCurrentNodeChanged = (nodeInfo) => {
  currentNodeInfo.value = nodeInfo || { nodeId: null, nodeName: '', nodeData: null }
}

const handleCurrentPathChanged = (pathInfo) => {
  currentPathInfo.value = pathInfo || { path: '/', pathSegments: [] }
}
watch(
  isTransferring,
  (val) => {
    emit('transfer-loading-change', val)
  },
  { immediate: true },
)

watch(
  transferProgress,
  (val) => {
    emit('transfer-progress-change', { ...val })
  },
  { deep: true, immediate: true },
)

onMounted(() => {
  loadTransferItems()
  transferEventBus.on(TRANSFER_EVENTS.ITEMS_ADDED, handleItemsAdded)
  transferEventBus.on(TRANSFER_EVENTS.ITEMS_REMOVED, handleItemsRemoved)
  transferEventBus.on(TRANSFER_EVENTS.REFRESH_REQUIRED, handleRefreshRequired)
  transferEventBus.on(TRANSFER_EVENTS.STATUS_UPDATED, handleStatusUpdated)
  transferEventBus.on(TRANSFER_EVENTS.BATCH_STATUS_UPDATED, handleBatchStatusUpdated)
  transferEventBus.on(TRANSFER_EVENTS.CURRENT_NODE_CHANGED, handleCurrentNodeChanged)
  transferEventBus.on(TRANSFER_EVENTS.CURRENT_PATH_CHANGED, handleCurrentPathChanged)
})

onUnmounted(() => {
  emit('transfer-loading-change', false)
  transferEventBus.off(TRANSFER_EVENTS.ITEMS_ADDED, handleItemsAdded)
  transferEventBus.off(TRANSFER_EVENTS.ITEMS_REMOVED, handleItemsRemoved)
  transferEventBus.off(TRANSFER_EVENTS.REFRESH_REQUIRED, handleRefreshRequired)
  transferEventBus.off(TRANSFER_EVENTS.STATUS_UPDATED, handleStatusUpdated)
  transferEventBus.off(TRANSFER_EVENTS.BATCH_STATUS_UPDATED, handleBatchStatusUpdated)
  transferEventBus.off(TRANSFER_EVENTS.CURRENT_NODE_CHANGED, handleCurrentNodeChanged)
  transferEventBus.off(TRANSFER_EVENTS.CURRENT_PATH_CHANGED, handleCurrentPathChanged)
})

defineExpose({
  cancelTransfer,
})
</script>

<style scoped>
.file-transfer-area {
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.transfer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.transfer-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}


.transfer-content {
  position: relative;
  padding: 12px 14px 14px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.transfer-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.operation-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
  padding: 10px 12px;
}

.location-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.location-value {
  color: var(--el-text-color-primary);
}

.operation-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.selected-count {
  margin-left: 4px;
}

.transfer-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transfer-table :deep(.el-table__body-wrapper) {
  scrollbar-width: thin;
}
.table-file-name {
  margin-left: 6px;
  color: var(--el-text-color-primary);
}
.table-file-path {
  color: var(--el-text-color-secondary);
}

.node-group {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
}

.node-header {
  padding: 8px 12px;
  background: var(--el-fill-color-light);
}

.node-name {
  margin: 0 6px;
}

.node-items {
  display: flex;
  flex-direction: column;
}

.transfer-item {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.transfer-item:first-child {
  border-top: none;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-primary);
}

.item-details {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.transfer-status-icon.success {
  color: var(--el-color-success);
}

.transfer-status-icon.error {
  color: var(--el-color-danger);
}

.transfer-status-icon.pending {
  color: var(--el-text-color-placeholder);
}

.transfer-tips {
  margin-top: 12px;
}

@media (max-width: 640px) {
  .header-right {
    width: 100%;
    justify-content: flex-end;
    margin-top: 8px;
  }
}
</style>
