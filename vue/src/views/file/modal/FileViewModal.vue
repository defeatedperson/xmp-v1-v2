<template>
  <Teleport to="body">
    <div v-if="isVisible" class="modal-overlay">
      <div class="fv-modal-container" @click.stop>
        <div class="fv-modal-header">
          <div class="fv-header-left">
            <h2>{{ fileName }}</h2>
            <div class="fv-file-info-badge">
              <i :class="fileIcon" class="fv-file-icon"></i>
              <span class="fv-file-size">{{ formatSize(fileInfo?.size) }}</span>
            </div>
          </div>
          <div class="fv-header-right">
            <button
              class="fv-tool-btn"
              @click="toggleSearch"
              :class="{ active: showSearch }"
              v-if="isTextReady"
              title="搜索 (Ctrl+F)"
            >
              <i class="fas fa-search"></i>
            </button>
            <button class="fv-tool-btn" @click="refreshFile" :disabled="loading" title="刷新">
              <i :class="['fas', 'fa-sync-alt', { 'fa-spin': loading }]"></i>
            </button>
            <button class="fv-close-button" @click="closeModal" :disabled="saving">×</button>
          </div>
        </div>

        <div v-if="showSearch && isTextReady" class="fv-search-bar">
          <div class="fv-search-input-wrapper">
            <i class="fas fa-search"></i>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              @keyup.enter="findNext"
              @input="handleSearchInput"
              placeholder="搜索..."
              class="fv-search-input"
            />
            <span v-if="searchResults.length > 0" class="fv-search-count">
              {{ currentMatchIndex + 1 }} / {{ searchResults.length }}
            </span>
            <span v-else-if="searchQuery && searchResults.length === 0" class="fv-search-count fv-text-error">
              0 / 0
            </span>
          </div>
          <div class="fv-search-actions">
            <button class="fv-icon-btn" @click="findPrev" :disabled="searchResults.length === 0" title="上一个 (Shift+Enter)">
              <i class="fas fa-chevron-up"></i>
            </button>
            <button class="fv-icon-btn" @click="findNext" :disabled="searchResults.length === 0" title="下一个 (Enter)">
              <i class="fas fa-chevron-down"></i>
            </button>
            <button class="fv-icon-btn" @click="closeSearch" title="关闭">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div class="fv-modal-body">
          <div v-if="error" class="fv-error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{{ error }}</span>
            <button class="fv-retry-btn" @click="refreshFile">重试</button>
          </div>

          <div v-else-if="loading" class="fv-loading-container">
            <i class="fas fa-spinner fa-spin"></i>
            <span>正在加载文件内容...</span>
          </div>

          <div v-else-if="isTextReady" class="fv-text-editor-container">
            <div class="fv-line-numbers" ref="lineNumbersRef">
              <div
                v-for="n in lineCount"
                :key="n"
                class="fv-line-number"
                :class="{ 'fv-line-active': currentLine === n }"
              >
                {{ n }}
              </div>
            </div>
            <textarea
              ref="textareaRef"
              v-model="editContent"
              class="fv-editor-textarea"
              :disabled="saving"
              @input="handleContentChange"
              @scroll="handleScroll"
              @click="updateCursorPosition"
              @keyup="updateCursorPosition"
              @keydown.ctrl.f.prevent="toggleSearch"
              placeholder="文件内容..."
              spellcheck="false"
            ></textarea>
          </div>

          <div v-else-if="isImageFile" class="fv-image-preview">
            <div v-if="imageLoading" class="fv-image-loading">
              <i class="fas fa-spinner fa-spin"></i>
              <span>正在加载图片...</span>
            </div>
            <div v-else-if="imageError" class="fv-image-error">
              <i class="fas fa-exclamation-triangle"></i>
              <span>{{ imageError }}</span>
              <button class="fv-retry-btn" @click="loadImage">重试</button>
            </div>
            <img
              v-else-if="imageUrl"
              :src="imageUrl"
              :alt="fileName"
              class="fv-preview-image"
              @load="handleImageLoad"
              @error="handleImageError"
            />
          </div>
        </div>

        <div class="fv-modal-footer">
          <div class="fv-footer-left">
            <div v-if="fileInfo" class="fv-file-details">
              <span class="fv-detail-item">
                <i class="fas fa-calendar"></i>
                修改时间：{{ fileInfo.modified }}
              </span>
              <span class="fv-detail-item" v-if="isTextReady">
                <i class="fas fa-key"></i>
                权限：{{ fileInfo.permissions }}
              </span>
              <span class="fv-detail-item" v-if="isTextReady">
                <i class="fas fa-align-left"></i>
                行数：{{ lineCount }}
              </span>
            </div>
          </div>
          <div class="fv-footer-right">
            <div v-if="hasChanges" class="fv-changes-indicator">
              <i class="fas fa-circle fv-text-warning"></i>
              <span>有未保存的修改</span>
            </div>
            <button class="fv-btn fv-btn-cancel" @click="closeModal" :disabled="saving">
              取消
            </button>
            <button
              v-if="isTextReady"
              class="fv-btn fv-btn-primary"
              @click="saveFile"
              :disabled="saving || !hasChanges"
            >
              <i v-if="saving" class="fas fa-spinner fa-spin"></i>
              <i v-else class="fas fa-save"></i>
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import '@/assets/styles/file-view-modal.css'
import { fetchTextFile, saveTextFile, fetchImageBlobUrl } from '../tools/fileViewTool'

const props = defineProps({
  isVisible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  currentPath: { type: String, default: '/' },
  fileName: { type: String, default: '' },
  fileData: { type: Object, default: null },
})

const emit = defineEmits(['close', 'file-updated'])

const fileContent = ref('')
const editContent = ref('')
const originalContent = ref('')
const fileInfo = ref(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const imageUrl = ref('')
const imageLoading = ref(false)
const imageError = ref('')
const textReady = ref(false)

const textareaRef = ref(null)
const lineNumbersRef = ref(null)
const searchInputRef = ref(null)
const showSearch = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const currentMatchIndex = ref(-1)
const currentLine = ref(1)

const isTextReady = computed(() => textReady.value)

const isImageFile = computed(() => {
  const name = String(props.fileName || '').toLowerCase()
  const ext = name.split('.').pop() || ''
  const imageExtensions = ['jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff','tif']
  return imageExtensions.includes(ext)
})

const lineCount = computed(() => {
  if (!editContent.value) return 1
  return editContent.value.split('\n').length
})

const hasChanges = computed(() => editContent.value !== originalContent.value)

const fileIcon = computed(() => {
  const name = String(props.fileName || '').toLowerCase()
  const ext = name.split('.').pop() || ''
  const map = {
    jpg: 'fas fa-image', jpeg: 'fas fa-image', png: 'fas fa-image', gif: 'fas fa-image', svg: 'fas fa-image', webp: 'fas fa-image',
    js: 'fab fa-js-square', ts: 'fab fa-js-square', jsx: 'fab fa-react', vue: 'fab fa-vuejs', php: 'fab fa-php', py: 'fab fa-python',
    java: 'fab fa-java', html: 'fab fa-html5', css: 'fab fa-css3-alt',
    pdf: 'fas fa-file-pdf', doc: 'fas fa-file-word', docx: 'fas fa-file-word', xls: 'fas fa-file-excel', xlsx: 'fas fa-file-excel', ppt: 'fas fa-file-powerpoint', pptx: 'fas fa-file-powerpoint',
    zip: 'fas fa-file-archive', rar: 'fas fa-file-archive', '7z': 'fas fa-file-archive', tar: 'fas fa-file-archive',
    txt: 'fas fa-file-alt', md: 'fab fa-markdown', json: 'fas fa-file-code', xml: 'fas fa-file-code',
  }
  return map[ext] || 'fas fa-file'
})

const formatSize = (bytes) => {
  const b = Number(bytes || 0)
  if (!Number.isFinite(b) || b <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const loadFile = async () => {
  if (!props.nodeId || !props.fileName) return
  if (isImageFile.value) {
    textReady.value = false
    error.value = ''
    await loadImage()
    return
  }
  loading.value = true
  error.value = ''
  textReady.value = false
  const result = await fetchTextFile({
    nodeId: props.nodeId,
    path: props.currentPath,
    name: props.fileName,
  })
  loading.value = false
  if (!result.success) {
    error.value = result.message || '加载文件失败'
    return
  }
  textReady.value = true
  const data = result.data || {}
  fileInfo.value = data.info || null
  fileContent.value = data.content || ''
  originalContent.value = data.content || ''
  editContent.value = data.content || ''
}

const refreshFile = () => loadFile()

const loadImage = async () => {
  if (!props.nodeId || !props.fileName || !isImageFile.value) return
  imageLoading.value = true
  imageError.value = ''
  imageUrl.value = ''
  const result = await fetchImageBlobUrl({
    nodeId: props.nodeId,
    path: props.currentPath,
    name: props.fileName,
  })
  imageLoading.value = false
  if (!result.success) {
    imageError.value = result.message || '图片加载失败'
    return
  }
  imageUrl.value = result.url || ''
}

const handleImageLoad = () => {}
const handleImageError = () => { imageError.value = '图片加载失败' }

const handleContentChange = () => {
  if (showSearch.value && searchQuery.value) {
    handleSearchInput(false)
  }
  nextTick(updateCursorPosition)
}

const saveFile = async () => {
  if (!isTextReady.value || !hasChanges.value || saving.value) return
  saving.value = true
  const result = await saveTextFile({
    nodeId: props.nodeId,
    path: props.currentPath,
    name: props.fileName,
    content: editContent.value,
  })
  saving.value = false
  if (!result.success) {
    ElMessage.error(result.message || '保存失败')
    return
  }
  originalContent.value = editContent.value
  fileContent.value = editContent.value
  fileInfo.value = result.data?.info || fileInfo.value
  ElMessage.success(result.message || '文件保存成功')
  emit('file-updated', { fileName: props.fileName, path: props.currentPath })
}

const handleScroll = (e) => {
  if (lineNumbersRef.value) {
    lineNumbersRef.value.scrollTop = e.target.scrollTop
  }
}

const updateCursorPosition = () => {
  if (!textareaRef.value) return
  const cursorIndex = textareaRef.value.selectionStart
  const textBeforeCursor = editContent.value.substring(0, cursorIndex)
  currentLine.value = textBeforeCursor.split('\n').length
}

const toggleSearch = () => {
  showSearch.value = !showSearch.value
  if (showSearch.value) {
    nextTick(() => {
      searchInputRef.value?.focus()
      if (searchQuery.value) handleSearchInput()
    })
  } else {
    searchResults.value = []
    currentMatchIndex.value = -1
    textareaRef.value?.focus()
  }
}

const closeSearch = () => {
  showSearch.value = false
  searchResults.value = []
  currentMatchIndex.value = -1
  textareaRef.value?.focus()
}

const handleSearchInput = (jump = true) => {
  const shouldJump = typeof jump === 'boolean' ? jump : true
  if (!searchQuery.value) {
    searchResults.value = []
    currentMatchIndex.value = -1
    return
  }
  const text = editContent.value
  const query = searchQuery.value
  const results = []
  let pos = text.indexOf(query)
  while (pos !== -1) {
    results.push({ start: pos, end: pos + query.length })
    pos = text.indexOf(query, pos + 1)
  }
  searchResults.value = results
  if (results.length > 0) {
    if (shouldJump) {
      currentMatchIndex.value = 0
      highlightMatch(0)
    } else {
      currentMatchIndex.value = -1
    }
  } else {
    currentMatchIndex.value = -1
  }
}

const findNext = () => {
  if (searchResults.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value + 1) % searchResults.value.length
  highlightMatch(currentMatchIndex.value)
}

const findPrev = () => {
  if (searchResults.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + searchResults.value.length) % searchResults.value.length
  highlightMatch(currentMatchIndex.value)
}

const highlightMatch = (index) => {
  const match = searchResults.value[index]
  if (!match || !textareaRef.value) return
  textareaRef.value.focus()
  textareaRef.value.setSelectionRange(match.start, match.end)
  updateCursorPosition()
}

watch(
  () => ({
    visible: props.isVisible,
    fileName: props.fileName,
    currentPath: props.currentPath,
    nodeId: props.nodeId,
  }),
  (nv, ov) => {
    if (!nv.visible) {
      resetModal()
      return
    }
    if (!ov || nv.visible !== ov.visible || nv.fileName !== ov.fileName || nv.currentPath !== ov.currentPath || nv.nodeId !== ov.nodeId) {
      if (nv.fileName) loadFile()
    }
  },
  { deep: false }
)

const resetModal = () => {
  fileContent.value = ''
  editContent.value = ''
  originalContent.value = ''
  fileInfo.value = null
  loading.value = false
  saving.value = false
  error.value = ''
  textReady.value = false
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
  }
  imageUrl.value = ''
  imageLoading.value = false
  imageError.value = ''
  showSearch.value = false
  searchQuery.value = ''
  searchResults.value = []
  currentMatchIndex.value = -1
  currentLine.value = 1
}

const closeModal = () => {
  if (hasChanges.value) {
    if (confirm('有未保存的修改，确定要关闭吗？')) {
      emit('close')
    }
  } else {
    emit('close')
  }
}
</script>

<style scoped>
@import '@/assets/styles/file-view-modal.css';
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
</style>
