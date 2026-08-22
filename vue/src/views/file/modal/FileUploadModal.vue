<template>
  <el-dialog
    :model-value="visible"
    title="文件上传"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="(val) => !val && close()"
    @close="close"
    destroy-on-close
    align-center
  >
    <div v-if="errorMessage" class="error-block">
      <el-alert :title="errorMessage" type="error" show-icon :closable="false" />
    </div>

    <div
      class="upload-drop"
      :class="{ dragging: isDragOver, disabled: isUploading }"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.prevent="handleDrop"
      @click="openFileSelector"
    >
      <el-icon class="upload-icon"><UploadFilled /></el-icon>
      <div class="upload-text">
        <div class="primary-text">点击选择文件或拖拽文件到此处</div>
        <div class="limit-text">最大递归深度：10层，单批处理：50个文件</div>
      </div>
    </div>

    <div class="action-row">
      <el-button :disabled="isUploading" @click="openFileSelector">
        <el-icon><DocumentAdd /></el-icon>
        选择文件
      </el-button>
      <el-button :disabled="isUploading" @click="openFolderSelector">
        <el-icon><FolderOpened /></el-icon>
        选择文件夹
      </el-button>
    </div>

    <el-checkbox v-model="autoOverwrite" :disabled="isUploading">自动覆盖同名文件</el-checkbox>

    <div v-if="fileList.length" class="list-section">
      <div class="section-header">
        <div class="title">待上传文件（{{ fileList.length }}）</div>
        <el-button v-if="!isUploading" type="danger" link @click="clearFileList">
          清空列表
        </el-button>
      </div>

      <div v-if="duplicateFiles.length && !autoOverwrite" class="duplicate-toolbar">
        <el-tag type="warning" effect="dark">发现 {{ duplicateFiles.length }} 个重名文件</el-tag>
        <div class="duplicate-actions">
          <el-button size="small" type="primary" @click="batchSetDuplicateAction('overwrite')">
            全部覆盖
          </el-button>
          <el-button size="small" @click="batchSetDuplicateAction('skip')">全部跳过</el-button>
        </div>
      </div>

      <el-table :data="fileList" height="260" border class="file-table">
        <el-table-column label="文件">
          <template #default="{ row }">
            <div class="file-info">
              <i :class="getFileIconClass({ name: row.file?.name || row.relativePath, type: 'file' })"></i>
              <div class="file-meta">
                <div class="file-name">
                  {{ row.relativePath || row.file?.name }}
                  <el-tag v-if="row.isDuplicate" size="small" type="warning">重名</el-tag>
                </div>
                <div class="file-size">{{ formatFileSize(row.file?.size) }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="220">
          <template #default="{ row }">
            <div class="status-cell">
              <template v-if="row.checkingDuplicate">
                <el-icon class="spin"><Loading /></el-icon>
                <span>检查中...</span>
              </template>
              <template v-else-if="row.isDuplicate && !autoOverwrite && !row.duplicateAction">
                <el-button size="small" type="primary" link @click="setDuplicateAction(row, 'overwrite')">
                  覆盖
                </el-button>
                <el-button size="small" link @click="setDuplicateAction(row, 'skip')">跳过</el-button>
              </template>
              <template v-else-if="row.duplicateAction === 'overwrite'">
                <el-tag size="small" type="success">将覆盖</el-tag>
              </template>
              <template v-else-if="row.duplicateAction === 'skip'">
                <el-tag size="small" type="info">将跳过</el-tag>
              </template>
              <template v-else-if="row.status === 'uploading'">
                <el-progress :percentage="row.progress" :stroke-width="10" />
              </template>
              <template v-else-if="row.status === 'completed'">
                <el-tag size="small" type="success">上传完成</el-tag>
              </template>
              <template v-else-if="row.status === 'error'">
                <el-tag size="small" type="danger">上传失败</el-tag>
              </template>
              <template v-else-if="row.status === 'skipped'">
                <el-tag size="small" type="info">已跳过</el-tag>
              </template>
              <template v-else>
                <el-tag size="small" type="info">等待上传</el-tag>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="isUploading" class="overall-progress">
      <div class="overall-text">总进度：{{ completedFiles }}/{{ totalFiles }}</div>
      <el-progress :percentage="overallPercentage" />
    </div>

    <template #footer>
      <el-button @click="close" :disabled="isUploading">取消</el-button>
      <el-button type="primary" @click="startUpload" :disabled="!fileList.length || isUploading">
        {{ isUploading ? '上传中...' : `开始上传 (${fileList.length})` }}
      </el-button>
    </template>
  </el-dialog>

  <input ref="fileInput" type="file" multiple style="display: none" @change="handleFileSelect" />
  <input
    ref="folderInput"
    type="file"
    webkitdirectory
    style="display: none"
    @change="handleFolderSelect"
  />
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentAdd, FolderOpened, Loading, UploadFilled } from '@element-plus/icons-vue'
import { formatFileSize, getFileIconClass } from '../tools/fileListUtils'
import {
  buildFullPath,
  checkFileExists,
  generateFileHash,
  mergeChunks,
  sliceFile,
  uploadChunk,
} from '../tools/fileUploadTool'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  currentPath: { type: String, default: '/' },
})

const emit = defineEmits(['update:visible', 'uploaded'])

const isDragOver = ref(false)
const isUploading = ref(false)
const errorMessage = ref('')
const autoOverwrite = ref(false)
const fileList = ref([])
const completedFiles = ref(0)
const isCheckingDuplicates = ref(false)

const fileInput = ref(null)
const folderInput = ref(null)

const CHUNK_SIZE = 2 * 1024 * 1024
const MAX_DEPTH = 10
const BATCH_SIZE = 50

const totalFiles = computed(() => fileList.value.length)
const overallPercentage = computed(() => {
  if (!totalFiles.value) return 0
  return Math.round((completedFiles.value / totalFiles.value) * 100)
})

const duplicateFiles = computed(() =>
  fileList.value.filter((file) => file.isDuplicate && !file.duplicateAction),
)

const close = () => {
  if (!isUploading.value) emit('update:visible', false)
}

const resetState = () => {
  isDragOver.value = false
  isUploading.value = false
  errorMessage.value = ''
  autoOverwrite.value = false
  fileList.value = []
  completedFiles.value = 0
  isCheckingDuplicates.value = false
}

const handleDragOver = () => {
  if (!isUploading.value) isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const handleDrop = async (e) => {
  isDragOver.value = false
  if (isUploading.value) return
  const dataTransfer = e.dataTransfer
  const items = dataTransfer?.items
  const fileList = dataTransfer?.files
  if (items?.length) {
    const entries = Array.from(items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.webkitGetAsEntry?.())
      .filter(Boolean)
    const hasDirectory = entries.some((entry) => entry.isDirectory)
    if (hasDirectory) {
      await handleDroppedEntries(entries)
      return
    }
    if (fileList?.length) {
      processFileList(
        Array.from(fileList).map((file) => ({
          file,
          relativePath: file.name,
        })),
      )
      return
    }
    await handleDroppedEntries(entries)
    return
  }
  if (fileList?.length) {
    processFileList(
      Array.from(fileList).map((file) => ({
        file,
        relativePath: file.name,
      })),
    )
  }
}

const handleDroppedEntries = async (entries) => {
  const files = []
  for (const entry of entries) {
    await traverseFileTree(entry, '', files)
  }
  processFileList(files)
}

const traverseFileTree = async (item, path, files, depth = 0) => {
  return new Promise((resolve) => {
    if (depth > MAX_DEPTH) {
      resolve()
      return
    }
    if (item.isFile) {
      item.file(
        (file) => {
          files.push({ file, relativePath: path + file.name })
          resolve()
        },
        () => resolve(),
      )
      return
    }
    if (item.isDirectory) {
      const dirReader = item.createReader()
      dirReader.readEntries(
        async (entries) => {
          for (let i = 0; i < entries.length; i += BATCH_SIZE) {
            const batch = entries.slice(i, i + BATCH_SIZE)
            await Promise.all(
              batch.map((entry) => traverseFileTree(entry, path + item.name + '/', files, depth + 1)),
            )
            if (i + BATCH_SIZE < entries.length) {
              await new Promise((resolveInner) => setTimeout(resolveInner, 10))
            }
          }
          resolve()
        },
        () => resolve(),
      )
      return
    }
    resolve()
  })
}

const openFileSelector = () => {
  if (!isUploading.value) fileInput.value?.click()
}

const openFolderSelector = () => {
  if (!isUploading.value) folderInput.value?.click()
}

const handleFileSelect = (e) => {
  const files = Array.from(e.target.files || []).map((file) => ({
    file,
    relativePath: file.name,
  }))
  processFileList(files)
  e.target.value = ''
}

const handleFolderSelect = (e) => {
  const files = Array.from(e.target.files || []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }))
  processFileList(files)
  e.target.value = ''
}

const processFileList = async (files) => {
  if (!files.length) return
  const now = Date.now()
  const newFiles = files.map((fileObj, index) => ({
    id: now + index,
    file: fileObj.file,
    relativePath: fileObj.relativePath,
    status: 'pending',
    progress: 0,
    isDuplicate: false,
    duplicateAction: null,
    checkingDuplicate: false,
  }))
  fileList.value.push(...newFiles)
  errorMessage.value = ''
  if (!autoOverwrite.value) {
    await checkDuplicateFiles(newFiles)
  }
}

const checkDuplicateFiles = async (files) => {
  isCheckingDuplicates.value = true
  try {
    for (const fileObj of files) {
      const fileIndex = fileList.value.findIndex((f) => f.id === fileObj.id)
      if (fileIndex === -1) continue
      fileList.value[fileIndex].checkingDuplicate = true
      await nextTick()
      const result = await checkFileExists({
        nodeId: props.nodeId,
        currentPath: props.currentPath,
        relativePath: fileObj.relativePath,
      })
      fileList.value[fileIndex].isDuplicate = Boolean(result.data?.exists)
      fileList.value[fileIndex].checkingDuplicate = false
      await nextTick()
    }
  } finally {
    isCheckingDuplicates.value = false
  }
}

const clearFileList = () => {
  fileList.value = []
  completedFiles.value = 0
}

const setDuplicateAction = (file, action) => {
  file.duplicateAction = action
}

const batchSetDuplicateAction = (action) => {
  fileList.value.forEach((file) => {
    if (file.isDuplicate && !file.duplicateAction) {
      file.duplicateAction = action
    }
  })
}

const hasUnhandledDuplicates = () => duplicateFiles.value.length > 0

const startUpload = async () => {
  if (!fileList.value.length || !props.nodeId) return
  if (!autoOverwrite.value && hasUnhandledDuplicates()) {
    errorMessage.value = '请先处理所有重名文件的覆盖选项'
    ElMessage.warning('请先处理所有重名文件的覆盖选项')
    return
  }
  isUploading.value = true
  completedFiles.value = 0
  errorMessage.value = ''
  try {
    for (const fileObj of fileList.value) {
      if (fileObj.status === 'completed') continue
      if (fileObj.duplicateAction === 'skip') {
        fileObj.status = 'skipped'
        fileObj.progress = 100
        completedFiles.value += 1
        continue
      }
      fileObj.status = 'uploading'
      fileObj.progress = 0
      try {
        await uploadFileWithChunks(fileObj)
        fileObj.status = 'completed'
        fileObj.progress = 100
        if (fileObj.duplicateAction === 'overwrite') {
          fileObj.isDuplicate = false
          fileObj.duplicateAction = null
        }
        completedFiles.value += 1
      } catch {
        fileObj.status = 'error'
        fileObj.progress = 0
        completedFiles.value += 1
      }
    }
    removeSkippedFiles()
    const successCount = fileList.value.filter((f) => f.status === 'completed').length
    const errorCount = fileList.value.filter((f) => f.status === 'error').length
    if (errorCount === 0) {
      ElMessage.success(`上传完成！成功上传 ${successCount} 个文件`)
    } else if (successCount > 0) {
      ElMessage.warning(`上传完成！成功 ${successCount} 个，失败 ${errorCount} 个`)
    } else {
      ElMessage.error(`上传失败！${errorCount} 个文件上传失败`)
    }
    emit('uploaded')
  } catch (error) {
    const msg = String(error?.message || '上传过程中发生错误')
    errorMessage.value = msg
    ElMessage.error(msg)
  } finally {
    isUploading.value = false
  }
}

const removeSkippedFiles = () => {
  fileList.value = fileList.value.filter((file) => file.status !== 'skipped')
}

const uploadFileWithChunks = async (fileObj) => {
  const file = fileObj.file
  const fileHash = await generateFileHash(file)
  const chunks = sliceFile(file, CHUNK_SIZE)
  const totalChunks = chunks.length
  const { fileName, fullDirPath } = buildFullPath(fileObj.relativePath, props.currentPath)
  for (let i = 0; i < chunks.length; i += 1) {
    const result = await uploadChunk({
      nodeId: props.nodeId,
      fileHash,
      chunk: chunks[i],
      chunkIndex: i,
      totalChunks,
      fileName,
      fullDirPath,
    })
    if (!result.success) {
      throw new Error(result.message || '分片上传失败')
    }
    fileObj.progress = Math.round(((i + 1) / totalChunks) * 90)
  }
  const mergeResult = await mergeChunks({
    nodeId: props.nodeId,
    fileHash,
    totalChunks,
    fileName,
    fullDirPath,
  })
  if (!mergeResult.success) {
    throw new Error(mergeResult.message || '分片合并失败')
  }
  fileObj.progress = 100
}

watch(
  () => props.visible,
  (val) => {
    if (val) resetState()
  },
)

watch(
  () => autoOverwrite.value,
  (val) => {
    if (val) {
      fileList.value.forEach((file) => {
        if (file.isDuplicate) file.duplicateAction = 'overwrite'
      })
    } else if (fileList.value.length) {
      checkDuplicateFiles(fileList.value.filter((file) => !file.isDuplicate))
    }
  },
)
</script>

<style scoped>
.error-block {
  margin-bottom: 12px;
}

.upload-drop {
  border: 1px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  padding: 26px;
  text-align: center;
  background: var(--el-fill-color-light);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
  margin-bottom: 12px;
}

.upload-drop.dragging {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.upload-drop.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.upload-icon {
  font-size: 40px;
  color: var(--el-color-primary);
}

.upload-text {
  margin-top: 8px;
}

.primary-text {
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.limit-text {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.action-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.list-section {
  margin-top: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.title {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.duplicate-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.duplicate-actions {
  display: flex;
  gap: 8px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-info i {
  color: var(--el-color-info);
}

.file-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}

.file-size {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.status-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.overall-progress {
  margin-top: 12px;
}

.overall-text {
  margin-bottom: 6px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
