<template>
  <Teleport to="body">
    <div v-if="isVisible" class="modal-overlay">
      <div class="fv-modal-container" @click.stop>
        <!-- 弹窗头部 -->
        <div class="fv-modal-header">
          <div class="fv-header-left">
            <h2>{{ logTitle }}</h2>
            <div class="fv-file-info-badge">
              <i class="fas fa-file-lines fv-file-icon"></i>
              <span class="fv-file-size">{{ formatFileSize(fileInfo?.size) }}</span>
            </div>
          </div>

          <div class="fv-header-right">
            <!-- 工具按钮 -->
            <button
              class="fv-tool-btn"
              @click="toggleSearch"
              :class="{ active: showSearch }"
              title="搜索 (Ctrl+F)"
            >
              <i class="fas fa-search"></i>
            </button>
            <button class="fv-tool-btn" @click="refreshFile" :disabled="loading" title="刷新">
              <i :class="['fas', 'fa-sync-alt', { 'fa-spin': loading }]"></i>
            </button>
            <button
              v-if="props.logType === 'today-error'"
              class="fv-tool-btn"
              @click="handleClearErrorLog"
              :disabled="loading"
              title="清空错误日志"
            >
              <i class="fas fa-trash-alt"></i>
            </button>

            <button class="fv-close-button" @click="closeModal">×</button>
          </div>
        </div>

        <!-- 搜索栏 -->
        <div v-if="showSearch" class="fv-search-bar">
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

        <!-- 主内容区域 -->
        <div class="fv-modal-body">
          <!-- 错误提示 -->
          <div v-if="error" class="fv-error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{{ error }}</span>
            <button class="fv-retry-btn" @click="refreshFile">重试</button>
          </div>

          <!-- 加载状态 -->
          <div v-else-if="loading" class="fv-loading-container">
            <i class="fas fa-spinner fa-spin"></i>
            <span>正在加载日志内容...</span>
          </div>

          <!-- 日志内容显示 -->
          <div v-else class="fv-text-editor-container">
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
              v-model="logContent"
              class="fv-editor-textarea"
              readonly
              @scroll="handleScroll"
              @click="updateCursorPosition"
              @keyup="updateCursorPosition"
              @keydown.ctrl.f.prevent="toggleSearch"
              placeholder="日志内容..."
              spellcheck="false"
            ></textarea>
          </div>
        </div>

        <!-- 底部信息栏 -->
        <div class="fv-modal-footer">
          <div class="fv-footer-left">
            <div v-if="fileInfo" class="fv-file-details">
              <span class="fv-detail-item">
                <i class="fas fa-calendar"></i>
                修改时间：{{ fileInfo.modified }}
              </span>
              <span class="fv-detail-item">
                <i class="fas fa-align-left"></i>
                行数：{{ lineCount }}
              </span>
            </div>
          </div>

          <div class="fv-footer-right">
            <button class="fv-btn fv-btn-cancel" @click="closeModal">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import '@/assets/styles/file-view-modal.css'

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
  nodeId: {
    type: [String, Number],
    required: true,
  },
  site: {
    type: Object,
    required: true,
  },
  logType: {
    type: String,
    required: true,
    validator: (value) => ['today-access', 'today-error', 'history'].includes(value)
  },
  logFile: {
    type: Object,
    default: null
  }
})

// Emits
const emit = defineEmits(['close', 'refresh'])

// 响应式数据
const logContent = ref('')
const fileInfo = ref(null)
const loading = ref(false)
const error = ref('')

// 搜索相关状态
const textareaRef = ref(null)
const lineNumbersRef = ref(null)
const searchInputRef = ref(null)
const showSearch = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const currentMatchIndex = ref(-1)
const currentLine = ref(1)

// 计算属性
const lineCount = computed(() => {
  if (!logContent.value) return 1
  return logContent.value.split('\n').length
})

const logTitle = computed(() => {
  const domain = props.site.primaryDomain || props.site.id

  switch (props.logType) {
    case 'today-access':
      return `${domain} - 访问日志`
    case 'today-error':
      return `${domain} - 错误日志`
    case 'history':
      return `${domain} - ${props.logFile?.name || '历史日志'}`
    default:
      return '日志查看'
  }
})

// 构建日志文件路径
const buildLogPath = () => {
  const domain = props.site.primaryDomain || props.site.id

  switch (props.logType) {
    case 'today-access':
      return {
        path: 'openresty/web_log',
        name: `${domain}.access.log`
      }
    case 'today-error':
      return {
        path: 'openresty/web_log',
        name: `${domain}.error.log`
      }
    case 'history':
      return {
        path: `openresty/web_log/${domain}`,
        name: props.logFile?.name || ''
      }
    default:
      return null
  }
}

// 统一监听可见状态和日志相关参数，避免重复请求
watch(
  () => ({
    visible: props.isVisible,
    logType: props.logType,
    logFileName: props.logFile?.name || '',
    siteId: props.site?.id,
    primaryDomain: props.site?.primaryDomain,
    nodeId: props.nodeId,
  }),
  (newVal, oldVal) => {
    if (!newVal.visible) {
      resetModal()
      return
    }

    if (
      !oldVal ||
      newVal.visible !== oldVal.visible ||
      newVal.logType !== oldVal.logType ||
      newVal.logFileName !== oldVal.logFileName ||
      newVal.siteId !== oldVal.siteId ||
      newVal.primaryDomain !== oldVal.primaryDomain ||
      newVal.nodeId !== oldVal.nodeId
    ) {
      loadLog()
    }
  },
  { deep: false }
)

// 编辑器滚动同步
const handleScroll = (e) => {
  if (lineNumbersRef.value) {
    lineNumbersRef.value.scrollTop = e.target.scrollTop
  }
}

// 更新光标位置（行号）
const updateCursorPosition = () => {
  if (!textareaRef.value) return
  const cursorIndex = textareaRef.value.selectionStart
  const textBeforeCursor = logContent.value.substring(0, cursorIndex)
  currentLine.value = textBeforeCursor.split('\n').length
}

// 搜索相关方法
const toggleSearch = () => {
  showSearch.value = !showSearch.value
  if (showSearch.value) {
    nextTick(() => {
      searchInputRef.value?.focus()
      if (searchQuery.value) {
        handleSearchInput()
      }
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

  const text = logContent.value
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

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleClearErrorLog = async () => {
  if (props.logType !== 'today-error') return
  if (!props.nodeId || !props.site) {
    ElMessage.error('节点或站点信息缺失，无法清空错误日志')
    return
  }

  const domain = props.site.primaryDomain || props.site.id
  if (!domain) {
    ElMessage.error('站点主域名为空，无法清空错误日志')
    return
  }

  try {
    await ElMessageBox.confirm('确定要清空当前站点的错误日志吗？此操作不可恢复。', '清空确认', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch (e) {
    if (e && e.message === 'cancel') {
      return
    }
    return
  }

  loading.value = true
  error.value = ''

  try {
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}/logs/error/clear`
    const resp = await fetch(url, {
      method: 'POST'
    })

    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }

    if (!resp.ok) {
      const msg = result && result.message ? result.message : `HTTP ${resp.status}`
      throw new Error(msg)
    }

    if (!result || !result.success) {
      const msg = (result && (result.message || result.error)) || '清理错误日志失败'
      throw new Error(msg)
    }

    ElMessage.success('错误日志已清空')
    await loadLog()
  } catch (e) {
    console.error('清理错误日志失败:', e)
    ElMessage.error(e.message || '清理错误日志失败')
  } finally {
    loading.value = false
  }
}

// 加载日志内容
const loadLog = async () => {
  if (!props.nodeId || !props.site) return

  const logPath = buildLogPath()
  if (!logPath || !logPath.name) {
    error.value = '无效的日志文件路径'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await fetch(
      `/api/forward/${props.nodeId}/text?path=${encodeURIComponent(logPath.path)}&name=${encodeURIComponent(logPath.name)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
    )

    const result = await response.json()

    if (result.success) {
      fileInfo.value = result.data.info
      logContent.value = result.data.content || ''
    } else {
      error.value = result.error || '加载日志失败'
    }
  } catch (err) {
    console.error('加载日志失败:', err)
    error.value = '网络错误，请检查连接'
  } finally {
    loading.value = false
  }
}

// 刷新日志
const refreshFile = () => {
  loadLog()
}

// 重置模态框
const resetModal = () => {
  logContent.value = ''
  fileInfo.value = null
  loading.value = false
  error.value = ''

  // 重置搜索状态
  showSearch.value = false
  searchQuery.value = ''
  searchResults.value = []
  currentMatchIndex.value = -1
  currentLine.value = 1
}

// 关闭模态框
const closeModal = () => {
  emit('close')
}
</script>

<style scoped>
/* 复用 file-view-modal.css 的样式，这里只添加特定覆盖 */
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

/* 确保只读文本框不显示编辑光标 */
.fv-editor-textarea:read-only {
  cursor: text;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #475569;
}
</style>
