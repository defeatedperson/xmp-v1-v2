<template>
  <el-dialog
    :model-value="visible"
    title="删除确认"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="(val) => !val && close()"
    @close="close"
    destroy-on-close
    align-center
  >
    <div class="delete-body">
      <div class="target-info">
        <div class="icon-wrapper">
          <i :class="fileIcon"></i>
        </div>
        <div class="info-content">
          <div class="file-name" :title="fileName">{{ fileName || '-' }}</div>
          <div class="file-type">{{ fileTypeLabel }}</div>
        </div>
      </div>

      <el-alert
        type="warning"
        show-icon
        :closable="false"
        title="此操作不可恢复"
        :description="warningText"
        class="warning-box"
      />

      <div class="force-option">
        <div class="option-header">
          <span class="option-label">强制删除</span>
          <el-switch v-model="forceDelete" :disabled="submitting" />
        </div>
        <div class="option-desc">
          使用更高权限执行删除，适用于普通删除失败的情况。
        </div>
      </div>

      <div v-if="errorMessage" class="error-block">
        <el-alert :title="errorMessage" type="error" show-icon :closable="false" />
      </div>
    </div>

    <template #footer>
      <el-button @click="close" :disabled="submitting">取消</el-button>
      <el-button type="danger" :loading="submitting" @click="handleDelete">
        确定删除
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { deleteFileEntry } from '../tools/fileDeleteTool'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  file: { type: Object, default: null },
  currentPath: { type: String, default: '/' },
})

const emit = defineEmits(['update:visible', 'deleted'])

const forceDelete = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

const isFolder = computed(() => {
  const type = props.file?.type
  return type === 'directory' || type === 'folder'
})

const fileName = computed(() => props.file?.name || '')

const fileTypeLabel = computed(() => (isFolder.value ? '文件夹' : '文件'))

const fileIcon = computed(() => {
  if (isFolder.value) return 'fas fa-folder'
  return 'fas fa-file'
})

const warningText = computed(() =>
  isFolder.value ? '文件夹内的所有内容都将被永久删除。' : '文件将被永久删除。',
)

const resetState = () => {
  forceDelete.value = false
  submitting.value = false
  errorMessage.value = ''
}

const close = () => {
  if (!submitting.value) emit('update:visible', false)
}

const handleDelete = async () => {
  if (submitting.value) return
  if (!props.nodeId) {
    errorMessage.value = '请选择节点'
    return
  }
  if (!props.file) {
    errorMessage.value = '缺少删除目标'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  const result = await deleteFileEntry({
    nodeId: props.nodeId,
    file: props.file,
    currentPath: props.currentPath,
    force: forceDelete.value,
  })
  submitting.value = false
  if (!result.success) {
    errorMessage.value = result.message || '删除失败'
    return
  }
  ElMessage.success(result.message || '删除成功')
  emit('deleted', result)
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
.delete-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.target-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}

.icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 20px;
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

.warning-box {
  border-radius: var(--el-border-radius-base);
}

.force-option {
  padding: 12px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.option-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.option-label {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.option-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.error-block {
  margin-top: 4px;
}
</style>
