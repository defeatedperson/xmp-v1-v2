<template>
  <el-dialog
    :model-value="visible"
    title="批量操作"
    width="400px"
    :close-on-click-modal="!isProcessing"
    @update:model-value="(val) => !val && close()"
    @close="close"
    destroy-on-close
    align-center
  >
    <div v-if="errorMessage" class="error-block">
      <el-alert :title="errorMessage" type="error" show-icon :closable="false" />
    </div>

    <el-alert
      v-if="selectedFiles.length === 0"
      type="info"
      show-icon
      :closable="false"
      title="未选择任何文件"
      class="empty-alert"
    />

    <div v-else class="selected-section">
      <div class="section-header">
        <span class="section-title">已选择 {{ selectedFiles.length }} 个项目</span>
        <el-tag size="small" type="info" effect="plain">{{ displayPath }}</el-tag>
      </div>
      <el-table
        :data="tableRows"
        height="240"
        border
        size="small"
        class="selected-table"
      >
        <el-table-column label="名称" min-width="180">
          <template #default="{ row }">
            <div class="file-name-cell">
              <i :class="row.iconClass"></i>
              <span class="file-name-text" :title="row.name">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.typeLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="路径" min-width="220">
          <template #default="{ row }">
            <span class="file-path">{{ row.path }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-alert
      type="warning"
      show-icon
      :closable="false"
      title="批量删除不可恢复"
      description="请输入确认文本后才能执行删除操作。"
      class="warning-box"
    />

    <div class="delete-confirm">
      <el-input
        v-model="confirmationText"
        placeholder="请输入：我确认删除这些文件"
        :disabled="isProcessing"
        @keyup.enter="handleBatchDelete"
      />
      <div class="confirm-hint">必须完全匹配才能执行删除操作</div>
    </div>

    <template #footer>
      <el-button @click="close" :disabled="isProcessing">取消</el-button>
      <el-button
        @click="handleAddToTransfer"
        :loading="isProcessing && operationType === 'transfer'"
        :disabled="selectedFiles.length === 0 || isProcessing"
      >
        添加到中转站
      </el-button>
      <el-button
        type="danger"
        @click="handleBatchDelete"
        :loading="isProcessing && operationType === 'delete'"
        :disabled="
          selectedFiles.length === 0 ||
          isProcessing ||
          confirmationText !== deleteConfirmText
        "
      >
        批量删除
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { deleteFileEntry } from '../tools/fileDeleteTool'
import { getFileIconClass, getFileTypeText } from '../tools/fileListUtils'
import { TransferStorage } from '../tools/transferStorage'
import { transferEventBus, TRANSFER_EVENTS } from '../tools/transferEventBus'
import { pickFileIdentity } from '../tools/fileListTool'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  currentPath: { type: String, default: '/' },
  selectedFiles: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'deleted', 'transferred'])

const confirmationText = ref('')
const isProcessing = ref(false)
const errorMessage = ref('')
const operationType = ref('')

const deleteConfirmText = '我确认删除这些文件'

const displayPath = computed(() => (props.currentPath === '/' ? '根目录' : props.currentPath))

const normalizeBasePath = (path) => {
  const raw = String(path || '/').trim()
  if (!raw || raw === '/') return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

const buildDisplayPath = (file) => {
  const raw = String(file?.relativePath || '').trim()
  if (raw) return raw.startsWith('/') ? raw : `/${raw}`
  const base = normalizeBasePath(props.currentPath)
  const name = String(file?.name || '').trim()
  if (!name) return base
  return `${base === '/' ? '' : base}/${name}`
}

const tableRows = computed(() =>
  props.selectedFiles.map((file) => ({
    name: String(file?.name || ''),
    iconClass: getFileIconClass(file),
    typeLabel: getFileTypeText(file?.type),
    path: buildDisplayPath(file),
  })),
)

const resetState = () => {
  confirmationText.value = ''
  isProcessing.value = false
  errorMessage.value = ''
  operationType.value = ''
}

const close = () => {
  if (!isProcessing.value) emit('update:visible', false)
}

const handleAddToTransfer = async () => {
  if (isProcessing.value || props.selectedFiles.length === 0) return
  if (!props.nodeId) {
    errorMessage.value = '请选择节点'
    return
  }
  isProcessing.value = true
  operationType.value = 'transfer'
  errorMessage.value = ''
  try {
    const pathBase = String(props.currentPath || '/')
    const items = props.selectedFiles
      .map((file) => {
        const ident = pickFileIdentity(props.nodeId, file)
        const rawName = String(file?.name || '').trim()
        const computedRelativePath = ident.relativePath
          ? String(ident.relativePath)
          : rawName
            ? `${pathBase === '/' ? '' : pathBase}/${rawName}`
            : ''
        const name = rawName || String(computedRelativePath || '').split('/').pop()
        return {
          id: TransferStorage.generateId(),
          nodeId: String(ident.nodeId || ''),
          relativePath: computedRelativePath,
          type: String(ident.type || ''),
          name,
          transferStatus: 'pending',
          addedAt: Date.now(),
        }
      })
      .filter((item) => item.nodeId && item.relativePath && item.type)
    const ok = TransferStorage.addItems(items)
    if (!ok) {
      throw new Error('添加到中转站失败')
    }
    transferEventBus.emit(TRANSFER_EVENTS.ITEMS_ADDED, { items, count: items.length })
    ElMessage.success(`已添加 ${items.length} 个项目到中转站`)
    emit('transferred', { items, count: items.length })
  } catch (error) {
    const msg = error?.message || '添加到中转站失败'
    errorMessage.value = msg
    ElMessage.error(msg)
  } finally {
    isProcessing.value = false
    operationType.value = ''
  }
}

const handleBatchDelete = async () => {
  if (isProcessing.value || props.selectedFiles.length === 0) return
  if (confirmationText.value !== deleteConfirmText) {
    errorMessage.value = '请输入正确的确认文本'
    return
  }
  if (!props.nodeId) {
    errorMessage.value = '请选择节点'
    return
  }
  isProcessing.value = true
  operationType.value = 'delete'
  errorMessage.value = ''
  const failedFiles = []
  let successCount = 0
  for (const file of props.selectedFiles) {
    const result = await deleteFileEntry({
      nodeId: props.nodeId,
      file,
      currentPath: props.currentPath,
      force: false,
    })
    if (result.success) {
      successCount += 1
    } else {
      failedFiles.push({ name: file?.name || '', error: result.message || '删除失败' })
    }
  }
  if (successCount > 0) {
    ElMessage.success(
      `成功删除 ${successCount} 个项目${failedFiles.length ? `，失败 ${failedFiles.length} 个` : ''}`,
    )
  }
  if (failedFiles.length > 0 && successCount === 0) {
    ElMessage.error('批量删除失败')
  }
  emit('deleted', {
    successCount,
    failedFiles,
    totalCount: props.selectedFiles.length,
  })
  isProcessing.value = false
  operationType.value = ''
  close()
}

watch(
  () => props.visible,
  (val) => {
    if (val) resetState()
  },
)
</script>

<style scoped>
.error-block {
  margin-bottom: 12px;
}

.empty-alert {
  margin-bottom: 12px;
}

.selected-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-name-text {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path {
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.warning-box {
  margin-bottom: 10px;
}

.delete-confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.confirm-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
