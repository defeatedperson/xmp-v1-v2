<template>
  <div class="file-list">
    <div class="path-navigation">
      <div class="breadcrumb">
        <span class="path-item" @click="emitNavigate('/')">
          <i class="fas fa-home"></i> 根目录
        </span>
        <template v-for="(path, index) in pathSegments" :key="index">
          <span class="path-separator">
            <i class="fas fa-chevron-right"></i>
          </span>
          <span class="path-item" @click="emitNavigate(path.fullPath)">
            {{ path.name }}
          </span>
        </template>
      </div>
    </div>

    <div v-if="error" class="error-message">
      <i class="fas fa-exclamation-triangle"></i>
      <span>{{ error }}</span>
    </div>

    <div class="files-table-container" v-loading="loading">
      <div class="table-wrapper">
        <table class="files-table">
          <thead>
            <tr>
              <th style="width: 40px">
                <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
              </th>
              <th>名称</th>
              <th>类型</th>
              <th class="sortable-header" @click="toggleSort('size')">
                大小
                <i
                  v-if="sortBy === 'size'"
                  :class="['fas', sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down']"
                ></i>
                <i v-else class="fas fa-sort"></i>
              </th>
              <th class="sortable-header" @click="toggleSort('modified')">
                修改时间
                <i
                  v-if="sortBy === 'modified'"
                  :class="['fas', sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down']"
                ></i>
                <i v-else class="fas fa-sort"></i>
              </th>
              <th>权限</th>
              <th>所有者</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in displayFiles" :key="getFileKey(file)">
              <td style="width: 40px">
                <input
                  type="checkbox"
                  :checked="isSelected(file)"
                  @change="(event) => toggleFileSelect(file, event)"
                />
              </td>
              <td>
                <div class="file-name">
                  <i :class="getFileIconClass(file)" class="file-icon"></i>
                  <span
                    :class="{
                      'folder-name': isFolder(file),
                      'file-name-text': true,
                    }"
                    @click="handleNameClick(file)"
                    :title="file.name"
                  >
                    {{ file.name }}
                  </span>
                  <button class="action-btn transfer-btn" @click="emitAction('transfer', file)">
                    <i class="fas fa-exchange-alt"></i>
                  </button>
                </div>
              </td>
              <td>
                <span class="type-badge" :class="getFileTypeClass(file.type)">
                  {{ getFileTypeText(file.type) }}
                </span>
              </td>
              <td>{{ formatFileSize(file.sizeBytes, file.size) }}</td>
              <td>{{ file.modified || file.modifiedTime || '-' }}</td>
              <td>{{ file.permissions || '-' }}</td>
              <td>{{ file.owner || '-' }}</td>
              <td>
                <template v-if="isFolder(file)">
                  <button class="action-btn download-btn" @click="emitAction('download', file)">
                    下载
                  </button>
                  <button class="action-btn compress-btn" @click="emitAction('compress', file)">
                    压缩
                  </button>
                  <button class="action-btn rename-btn" @click="emitAction('rename', file)">
                    重命名
                  </button>
                  <button class="action-btn delete-btn" @click="emitAction('delete', file)">
                    删除
                  </button>
                  <button class="action-btn permission-btn" @click="emitAction('permission', file)">
                    权限
                  </button>
                </template>
                <template v-else-if="isArchiveFile(file)">
                  <button class="action-btn download-btn" @click="emitAction('download', file)">
                    下载
                  </button>
                  <button class="action-btn rename-btn" @click="emitAction('rename', file)">
                    重命名
                  </button>
                  <button class="action-btn delete-btn" @click="emitAction('delete', file)">
                    删除
                  </button>
                  <button class="action-btn permission-btn" @click="emitAction('permission', file)">
                    权限
                  </button>
                  <button class="action-btn decompress-btn" @click="emitAction('decompress', file)">
                    解压
                  </button>
                </template>
                <template v-else>
                  <button class="action-btn download-btn" @click="emitAction('download', file)">
                    下载
                  </button>
                  <button class="action-btn compress-btn" @click="emitAction('compress', file)">
                    压缩
                  </button>
                  <button class="action-btn rename-btn" @click="emitAction('rename', file)">
                    重命名
                  </button>
                  <button class="action-btn delete-btn" @click="emitAction('delete', file)">
                    删除
                  </button>
                  <button class="action-btn edit-btn" @click="emitAction('edit', file)">
                    编辑
                  </button>
                  <button class="action-btn permission-btn" @click="emitAction('permission', file)">
                    权限
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="displayFiles.length === 0 && !loading" class="no-data">
          {{ searchQuery ? '未找到匹配的文件' : '当前目录为空' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  formatFileSize,
  getFileIconClass,
  getFileTypeClass,
  getFileTypeText,
  isArchiveFile,
  isFolder,
} from '../tools/fileListUtils'

const props = defineProps({
  files: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  currentPath: { type: String, default: '/' },
  searchQuery: { type: String, default: '' },
})

const emit = defineEmits(['navigate', 'action', 'sort-change', 'selection-change'])

const sortBy = ref('')
const sortDirection = ref('asc')
const selectedKeys = ref(new Set())

const normalizedPath = computed(() => {
  const raw = String(props.currentPath || '').trim()
  if (!raw || raw === '/') return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
})

const pathSegments = computed(() => {
  if (normalizedPath.value === '/') return []
  const parts = normalizedPath.value.split('/').filter(Boolean)
  const segments = []
  let accum = ''
  parts.forEach((name) => {
    accum += `/${name}`
    segments.push({ name, fullPath: accum })
  })
  return segments
})

const filteredFiles = computed(() => {
  if (!props.searchQuery) return props.files
  const query = props.searchQuery.toLowerCase()
  return props.files.filter((file) => String(file.name || '').toLowerCase().includes(query))
})

const displayFiles = computed(() => {
  const list = [...filteredFiles.value]
  if (!sortBy.value) return list
  const dir = sortDirection.value === 'asc' ? 1 : -1
  if (sortBy.value === 'size') {
    return list.sort((a, b) => (Number(a.sizeBytes || 0) - Number(b.sizeBytes || 0)) * dir)
  }
  if (sortBy.value === 'modified') {
    return list.sort((a, b) => {
      const aTime = new Date(a.modified || a.modifiedTime || 0).getTime()
      const bTime = new Date(b.modified || b.modifiedTime || 0).getTime()
      return (aTime - bTime) * dir
    })
  }
  return list
})

const getFileKey = (file) => String(file.relativePath || file.name || '')

const isSelected = (file) => selectedKeys.value.has(getFileKey(file))

const allSelected = computed(() => {
  if (displayFiles.value.length === 0) return false
  return displayFiles.value.every((file) => selectedKeys.value.has(getFileKey(file)))
})

const toggleFileSelect = (file, event) => {
  const checked = event?.target?.checked
  const next = new Set(selectedKeys.value)
  const key = getFileKey(file)
  if (checked) {
    next.add(key)
  } else {
    next.delete(key)
  }
  selectedKeys.value = next
  emit('selection-change', Array.from(next))
}

const toggleSelectAll = (event) => {
  const checked = event?.target?.checked
  const next = new Set()
  if (checked) {
    displayFiles.value.forEach((file) => next.add(getFileKey(file)))
  }
  selectedKeys.value = next
  emit('selection-change', Array.from(next))
}

const toggleSort = (key) => {
  if (sortBy.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = key
    sortDirection.value = 'asc'
  }
  emit('sort-change', { sortBy: sortBy.value, sortDirection: sortDirection.value })
}

const emitNavigate = (path) => {
  emit('navigate', path)
}

const emitAction = (action, file) => {
  emit('action', { action, file })
}

const handleNameClick = (file) => {
  if (isFolder(file)) {
    emit('navigate', file.relativePath || file.name || '/')
    return
  }
  emitAction('open', file)
}

watch(
  () => props.files,
  () => {
    selectedKeys.value = new Set()
  },
)
</script>

<style scoped>
.file-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.path-navigation {
  background: var(--el-bg-color-overlay);
  padding: 12px 16px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.path-item {
  cursor: pointer;
  color: var(--el-text-color-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.path-item:hover {
  color: var(--el-color-primary);
}

.path-separator {
  color: var(--el-text-color-placeholder);
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-color-danger-light-7);
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.files-table-container {
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  overflow-x: auto;
  position: relative;
}

.table-wrapper {
  overflow-x: auto;
}

.files-table {
  width: 100%;
  min-width: 1200px;
  border-collapse: collapse;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.files-table thead th {
  text-align: left;
  padding: 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-weight: 600;
  border-bottom: 1px solid var(--el-border-color-lighter);
  user-select: none;
}

.files-table tbody td {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.sortable-header {
  cursor: pointer;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.file-icon {
  color: var(--el-text-color-secondary);
}

.file-name-text {
  cursor: pointer;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  max-width: 160px;
  min-width: 0;
}

.folder-name {
  color: var(--el-color-primary);
}

.type-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
}

.type-folder {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.type-file {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.type-archive {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.type-image {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.type-text {
  background: var(--el-color-info-light-9);
  color: var(--el-color-info);
}

.action-btn {
  margin-right: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  cursor: pointer;
  font-size: 12px;
}

.action-btn:hover {
  border-color: var(--el-border-color);
  color: var(--el-text-color-primary);
}

.transfer-btn {
  padding: 4px 6px;
}

.no-data {
  padding: 20px;
  text-align: center;
  color: var(--el-text-color-placeholder);
}
</style>
