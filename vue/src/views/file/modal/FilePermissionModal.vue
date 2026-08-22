<template>
  <el-dialog
    :model-value="visible"
    title="设置权限"
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

    <div class="permission-section">
      <div class="permission-grid">
        <div class="permission-group">
          <div class="group-label">所有者</div>
          <div class="permission-checkboxes">
            <el-checkbox v-model="permissions.owner.read" :disabled="submitting">读取</el-checkbox>
            <el-checkbox v-model="permissions.owner.write" :disabled="submitting">写入</el-checkbox>
            <el-checkbox v-model="permissions.owner.execute" :disabled="submitting">可执行</el-checkbox>
          </div>
        </div>
        <div class="permission-group">
          <div class="group-label">用户组</div>
          <div class="permission-checkboxes">
            <el-checkbox v-model="permissions.group.read" :disabled="submitting">读取</el-checkbox>
            <el-checkbox v-model="permissions.group.write" :disabled="submitting">写入</el-checkbox>
            <el-checkbox v-model="permissions.group.execute" :disabled="submitting">可执行</el-checkbox>
          </div>
        </div>
        <div class="permission-group">
          <div class="group-label">公共</div>
          <div class="permission-checkboxes">
            <el-checkbox v-model="permissions.other.read" :disabled="submitting">读取</el-checkbox>
            <el-checkbox v-model="permissions.other.write" :disabled="submitting">写入</el-checkbox>
            <el-checkbox v-model="permissions.other.execute" :disabled="submitting">可执行</el-checkbox>
          </div>
        </div>
      </div>

      <div class="permission-display">
        <span class="octal-label">权限</span>
        <span class="octal-value">{{ octalPermission }}</span>
      </div>
    </div>

    <el-checkbox
      v-if="isFolder"
      v-model="applyRecursive"
      :disabled="submitting"
      class="recursive-option"
    >
      递归应用到子文件夹和文件
    </el-checkbox>

    <div class="path-info">
      <span class="path-label">当前位置</span>
      <span class="path-value">{{ displayPath }}</span>
    </div>

    <template #footer>
      <el-button @click="close" :disabled="submitting">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting" :disabled="!file">
        应用权限
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFileIconClass, getFileTypeText, isFolder as isFolderType } from '../tools/fileListUtils'
import { setFilePermission } from '../tools/filePermissionTool'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  currentPath: { type: String, default: '/' },
  file: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'permission-updated'])

const permissions = ref({
  owner: { read: true, write: true, execute: false },
  group: { read: true, write: false, execute: false },
  other: { read: true, write: false, execute: false },
})

const applyRecursive = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

const fileName = computed(() => props.file?.name || '')
const fileTypeLabel = computed(() => getFileTypeText(props.file?.type))
const fileIcon = computed(() => getFileIconClass(props.file))
const displayPath = computed(() => (props.currentPath === '/' ? '根目录' : props.currentPath))
const isFolder = computed(() => isFolderType(props.file))

const octalPermission = computed(() => {
  const ownerValue =
    (permissions.value.owner.read ? 4 : 0) +
    (permissions.value.owner.write ? 2 : 0) +
    (permissions.value.owner.execute ? 1 : 0)
  const groupValue =
    (permissions.value.group.read ? 4 : 0) +
    (permissions.value.group.write ? 2 : 0) +
    (permissions.value.group.execute ? 1 : 0)
  const otherValue =
    (permissions.value.other.read ? 4 : 0) +
    (permissions.value.other.write ? 2 : 0) +
    (permissions.value.other.execute ? 1 : 0)
  return `${ownerValue}${groupValue}${otherValue}`
})

const resetForm = () => {
  applyRecursive.value = false
  errorMessage.value = ''
  submitting.value = false
}

const parseOctalPermissions = (octal) => {
  const owner = parseInt(octal[0], 10)
  const group = parseInt(octal[1], 10)
  const other = parseInt(octal[2], 10)
  permissions.value = {
    owner: { read: (owner & 4) !== 0, write: (owner & 2) !== 0, execute: (owner & 1) !== 0 },
    group: { read: (group & 4) !== 0, write: (group & 2) !== 0, execute: (group & 1) !== 0 },
    other: { read: (other & 4) !== 0, write: (other & 2) !== 0, execute: (other & 1) !== 0 },
  }
}

const parseStringPermissions = (permStr) => {
  const raw = permStr.length > 9 ? permStr.slice(1, 10) : permStr.slice(0, 9)
  permissions.value = {
    owner: { read: raw[0] === 'r', write: raw[1] === 'w', execute: raw[2] === 'x' },
    group: { read: raw[3] === 'r', write: raw[4] === 'w', execute: raw[5] === 'x' },
    other: { read: raw[6] === 'r', write: raw[7] === 'w', execute: raw[8] === 'x' },
  }
}

const parseCurrentPermissions = () => {
  const permStr = String(props.file?.permissions || '').trim()
  if (/^\d{3,4}$/.test(permStr)) {
    parseOctalPermissions(permStr.slice(-3))
    return
  }
  if (permStr.length >= 9) {
    parseStringPermissions(permStr)
    return
  }
  parseOctalPermissions('644')
}

const close = () => {
  if (!submitting.value) emit('update:visible', false)
}

const handleSubmit = async () => {
  if (submitting.value) return
  if (!props.nodeId) {
    errorMessage.value = '请选择节点'
    return
  }
  if (!props.file) {
    errorMessage.value = '缺少权限目标'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  const result = await setFilePermission({
    nodeId: props.nodeId,
    path: props.currentPath,
    name: props.file.name,
    permissions: octalPermission.value,
    recursive: applyRecursive.value && isFolder.value,
  })
  submitting.value = false
  if (!result.success) {
    errorMessage.value = result.message || '权限设置失败'
    return
  }
  ElMessage.success(result.message || '权限设置成功')
  emit('permission-updated', {
    file: props.file,
    permissions: octalPermission.value,
    recursive: applyRecursive.value && isFolder.value,
  })
  close()
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      resetForm()
      parseCurrentPermissions()
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
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
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

.permission-section {
  margin-bottom: 12px;
}

.permission-grid {
  display: grid;
  gap: 16px;
  padding: 12px;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}

.permission-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.permission-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.permission-display {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  gap: 10px;
}

.octal-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.octal-value {
  color: var(--el-color-warning);
  font-size: 16px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-border-color-lighter);
}

.recursive-option {
  margin: 4px 0 12px;
}

.path-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 8px;
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
