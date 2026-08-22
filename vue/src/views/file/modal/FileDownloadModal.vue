<template>
  <el-dialog
    :model-value="visible"
    title="下载文件"
    width="540px"
    :close-on-click-modal="!isDownloading"
    :close-on-press-escape="!isDownloading"
    @update:model-value="(val) => !val && close()"
    @close="close"
    destroy-on-close
    align-center
  >
    <div v-if="errorMessage" class="error-block">
      <el-alert :title="errorMessage" type="error" show-icon :closable="false" />
    </div>

    <div v-if="isDownloading || downloadReady" class="status-block">
      <el-alert
        v-if="isDownloading"
        type="info"
        show-icon
        :closable="false"
        :title="pollMessage"
      />
      <el-alert
        v-else-if="downloadReady"
        type="success"
        show-icon
        :closable="false"
        title="打包完成，请点击下方按钮下载"
      />
    </div>

    <div class="source-info">
      <div class="icon-wrapper">
        <i :class="fileIcon"></i>
      </div>
      <div class="info-content">
        <div class="file-name" :title="fileName">{{ fileName || '未选择文件' }}</div>
        <div class="file-type">{{ fileTypeLabel }}</div>
      </div>
    </div>

    <el-alert
      v-if="!isDownloading"
      class="info-alert"
      type="info"
      show-icon
      :closable="false"
      :title="isFolderType ? '文件夹将自动打包为 ZIP 后下载，可能需要一定时间。' : '点击下方按钮直接下载。'"
    />

    <div class="path-info">
      <span class="path-label">文件位置</span>
      <span class="path-value">{{ displayPath }}</span>
    </div>

    <template #footer>
      <el-button @click="close" :disabled="isDownloading">取消</el-button>
      <el-button
        v-if="downloadReady"
        type="success"
        @click="handleConfirmDownload"
      >
        确认下载
      </el-button>
      <el-button
        v-else
        type="primary"
        @click="prepareDownload"
        :loading="isDownloading"
        :disabled="!file"
      >
        {{ isDownloading ? (isFolderType ? '打包中...' : '下载中...') : '开始下载' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getFileIconClass, getFileTypeText, isFolder } from '../tools/fileListUtils'
import { normalizeRelativePath } from '../tools/fileCreateTool'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  currentPath: { type: String, default: '/' },
  file: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'downloaded'])

const isDownloading = ref(false)
const downloadReady = ref(false)
const errorMessage = ref('')
const pollCount = ref(0)
const pollTimer = ref(null)
const downloadInfo = ref({ path: '', name: '' })

const fileName = computed(() => props.file?.name || '')
const fileTypeLabel = computed(() => getFileTypeText(props.file?.type))
const fileIcon = computed(() => getFileIconClass(props.file))
const displayPath = computed(() => (props.currentPath === '/' ? '根目录' : props.currentPath))
const isFolderType = computed(() => isFolder(props.file))


const pollMessage = computed(() => {
  const count = pollCount.value
  if (count === 0) return '正在打包中...'
  if (count === 1) return '✅ 确认接口正常工作中...'
  if (count === 2) return '📦 还在打包中，请耐心等待...'
  if (count < 5) return '📂 正在整理文件...'
  if (count < 8) return '⏳ 文件有点多，请稍候...'
  if (count < 12) return '🔥 马上就好啦...'
  return '💪 正在努力打包中...'
})

const resetState = () => {
  errorMessage.value = ''
  isDownloading.value = false
  downloadReady.value = false
  pollCount.value = 0
  downloadInfo.value = { path: '', name: '' }
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

const close = () => {
  if (!isDownloading.value) emit('update:visible', false)
}

const buildDownloadUrl = (path, name, type) => {
  const nodeId = String(props.nodeId ?? '').trim()
  return `/api/forward/${encodeURIComponent(nodeId)}/file/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}&type=${type}`
}

const handleConfirmDownload = () => {
  if (!downloadInfo.value.name) return
  window.open(buildDownloadUrl(downloadInfo.value.path, downloadInfo.value.name, 'file'), '_blank')
  emit('downloaded', {
    fileName: downloadInfo.value.name,
    fileType: 'archive',
    path: normalizeRelativePath(props.currentPath),
  })
  close()
}

const prepareDownload = async () => {
  if (!props.file || isDownloading.value) return
  if (props.currentPath === '/' && props.file.name === 'temp') {
    errorMessage.value = '系统临时目录无法下载'
    return
  }
  if (!props.nodeId) {
    errorMessage.value = '请选择节点'
    return
  }
  isDownloading.value = true
  errorMessage.value = ''
  pollCount.value = 0

  const path = props.currentPath
  const name = props.file.name
  const type = isFolderType.value ? 'folder' : 'file'

  if (!isFolderType.value) {
    window.open(buildDownloadUrl(path, name, type), '_blank')
    emit('downloaded', {
      fileName: props.file.name,
      fileType: props.file?.type,
      path: normalizeRelativePath(props.currentPath),
    })
    isDownloading.value = false
    close()
    return
  }

  const nodeId = String(props.nodeId).trim()
  const prepareUrl = `/api/forward/${encodeURIComponent(nodeId)}/file/download/prepare?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}&type=${type}`

  const poll = async () => {
    try {
      const resp = await fetch(prepareUrl)
      const result = await resp.json()
      if (!result.success) {
        errorMessage.value = result.error || '打包失败'
        isDownloading.value = false
        return true
      }
      if (result.status === 'completed') {
        const downloadPath = result.path
        const downloadName = result.name
        if (!downloadPath || !downloadName) {
          errorMessage.value = '打包结果缺失'
          isDownloading.value = false
          return true
        }
        downloadInfo.value = { path: downloadPath, name: downloadName }
        downloadReady.value = true
        isDownloading.value = false
        return true
      }
      if (result.status === 'failed') {
        errorMessage.value = result.error || '打包失败'
        isDownloading.value = false
        return true
      }
      pollCount.value++
      return false
    } catch (e) {
      errorMessage.value = '请求失败：' + String(e && e.message)
      isDownloading.value = false
      return true
    }
  }

  const timer = setInterval(async () => {
    const done = await poll()
    if (done) {
      clearInterval(timer)
      pollTimer.value = null
    }
  }, 5000)
  pollTimer.value = timer

  await poll()
}

watch(
  () => props.visible,
  (val) => {
    if (val) resetState()
  },
)

onBeforeUnmount(() => {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
})
</script>

<style scoped>
.error-block {
  margin-bottom: 12px;
}

.status-block {
  margin-bottom: 12px;
}

.source-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 12px;
}

.icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 18px;
}

.info-content {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-type {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.info-alert {
  margin-bottom: 12px;
}

.path-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 12px;
}

.path-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.path-value {
  color: var(--el-text-color-primary);
  font-size: 13px;
  word-break: break-all;
}

.detail-box {
  margin-bottom: 8px;
}
</style>
