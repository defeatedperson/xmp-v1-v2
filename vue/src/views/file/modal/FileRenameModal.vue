<template>
  <el-dialog
    :model-value="visible"
    title="重命名"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="(val) => !val && close()"
    @close="close"
    destroy-on-close
    align-center
  >
    <div v-if="errorMessage" class="error-block">
      <el-alert :title="errorMessage" type="error" show-icon :closable="false" />
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

    <el-form label-position="top" :disabled="submitting">
      <el-form-item :label="isFolder ? '新文件夹名' : '新文件名'">
        <el-input
          ref="nameInputRef"
          v-model="newName"
          :placeholder="isFolder ? '请输入新文件夹名' : '请输入新文件名'"
          clearable
          @keyup.enter="handleSubmit"
        />
      </el-form-item>
    </el-form>

    <el-alert
      title="修改扩展名可能导致出现未知问题，请谨慎操作。"
      type="warning"
      show-icon
      :closable="false"
      class="info-alert"
    />

    <div class="path-info">
      <span class="path-label">当前位置</span>
      <span class="path-value">{{ displayPath }}</span>
    </div>

    <template #footer>
      <el-button @click="close" :disabled="submitting">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting" :disabled="!canSubmit">
        重命名
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFileIconClass, getFileTypeText, isFolder as isFolderType } from '../tools/fileListUtils'
import { validateFileName } from '../tools/fileCreateTool'
import { renameFileEntry } from '../tools/fileRenameTool'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  currentPath: { type: String, default: '/' },
  file: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'renamed'])

const newName = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const nameInputRef = ref(null)

const fileName = computed(() => props.file?.name || '')
const fileTypeLabel = computed(() => getFileTypeText(props.file?.type))
const fileIcon = computed(() => getFileIconClass(props.file))
const displayPath = computed(() => (props.currentPath === '/' ? '根目录' : props.currentPath))
const isFolder = computed(() => isFolderType(props.file))

const trimmedNewName = computed(() => String(newName.value || '').trim())
const canSubmit = computed(
  () => Boolean(props.file) && trimmedNewName.value && trimmedNewName.value !== fileName.value,
)

const reservedNames = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]

const validateRenameName = (name) => {
  const raw = String(name || '').trim()
  if (raw === fileName.value) return '新名称不能与原名称相同'
  const baseError = validateFileName(raw)
  if (baseError) return baseError
  if (raw.startsWith(' ') || raw.endsWith(' ') || raw.endsWith('.')) {
    return '名称不能以空格开头或以空格、点结尾'
  }
  const upper = raw.toUpperCase()
  const baseName = raw.replace(/\.[^/.]+$/, '').toUpperCase()
  if (reservedNames.includes(upper) || reservedNames.includes(baseName)) {
    return '不能使用系统保留名称'
  }
  return null
}

const getInputEl = () => nameInputRef.value?.input || nameInputRef.value?.textarea

const selectNamePart = () => {
  const inputEl = getInputEl()
  if (!inputEl) return
  const value = String(newName.value || '')
  if (!value) return
  if (!isFolder.value) {
    const lastDot = value.lastIndexOf('.')
    if (lastDot > 0) {
      inputEl.setSelectionRange(0, lastDot)
      return
    }
  }
  inputEl.select?.()
}

const resetForm = () => {
  newName.value = fileName.value
  errorMessage.value = ''
  submitting.value = false
}

const focusInput = () => {
  nextTick(() => {
    const inputEl = getInputEl()
    inputEl?.focus?.()
    selectNamePart()
  })
}

const close = () => {
  if (!submitting.value) emit('update:visible', false)
}

const handleSubmit = async () => {
  if (submitting.value || !props.file) return
  if (!props.nodeId) {
    errorMessage.value = '请选择节点'
    return
  }
  const validationError = validateRenameName(newName.value)
  if (validationError) {
    errorMessage.value = validationError
    return
  }
  submitting.value = true
  errorMessage.value = ''
  const result = await renameFileEntry({
    nodeId: props.nodeId,
    file: props.file,
    currentPath: props.currentPath,
    newName: trimmedNewName.value,
  })
  submitting.value = false
  if (!result.success) {
    errorMessage.value = result.message || '重命名失败'
    return
  }
  ElMessage.success(result.message || '重命名成功')
  emit('renamed', {
    file: props.file,
    oldName: fileName.value,
    newName: trimmedNewName.value,
  })
  close()
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      resetForm()
      focusInput()
    }
  },
)

watch(
  () => props.file,
  (val) => {
    if (val && props.visible) {
      resetForm()
      focusInput()
    }
  },
)
</script>

<style scoped>
.error-block {
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
  border-radius: var(--el-border-radius-base);
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
</style>
