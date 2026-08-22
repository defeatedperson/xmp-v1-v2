<template>
  <el-dialog
    :model-value="visible"
    title="创建压缩包"
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
      <el-form-item label="压缩包名称（可选）">
        <el-input
          v-model="archiveName"
          placeholder="不填则使用源文件名.zip"
          @keyup.enter="handleSubmit"
        />
      </el-form-item>

      <div class="path-info">
        <span class="path-label">创建位置</span>
        <span class="path-value">{{ displayPath }}</span>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="close" :disabled="submitting">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting" :disabled="!file">
        创建压缩包
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createCompressTask, validateArchiveName } from '../tools/fileCompressTool'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  currentPath: { type: String, default: '/' },
  file: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'compressed'])

const archiveName = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const pollTimer = ref(null)

const isFolder = computed(() => {
  const type = props.file?.type
  return type === 'directory' || type === 'folder'
})

const fileName = computed(() => props.file?.name || '')
const fileTypeLabel = computed(() => (isFolder.value ? '文件夹' : '文件'))
const fileIcon = computed(() => (isFolder.value ? 'fas fa-folder' : 'fas fa-file'))
const displayPath = computed(() => (props.currentPath === '/' ? '根目录' : props.currentPath))

const resetForm = () => {
  archiveName.value = ''
  errorMessage.value = ''
  submitting.value = false
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
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
    errorMessage.value = '缺少压缩目标'
    return
  }
  if (props.currentPath === '/' && props.file.name === 'temp') {
    errorMessage.value = '系统临时目录无法压缩'
    return
  }
  if (archiveName.value.trim()) {
    const validationError = validateArchiveName(archiveName.value)
    if (validationError) {
      errorMessage.value = validationError
      return
    }
  }

  submitting.value = true
  errorMessage.value = ''
  const result = await createCompressTask({
    nodeId: props.nodeId,
    path: props.currentPath,
    sourceName: props.file.name,
    archiveName: archiveName.value.trim() || undefined,
  })
  if (!result.success || !result.taskId) {
    submitting.value = false
    errorMessage.value = result.message || '压缩失败'
    return
  }

  const taskId = String(result.taskId)
  const poll = async () => {
    try {
      const resp = await fetch(`/api/forward/${encodeURIComponent(props.nodeId)}/file-task/status?id=${encodeURIComponent(taskId)}`)
      const status = await resp.json()
      if (!status.success || !status.data) return false
      const task = status.data
      const taskStatus = String(task.status || '')
      if (taskStatus === 'failed' || taskStatus === 'error') {
        errorMessage.value = task.message || task.result?.message || '压缩失败'
        submitting.value = false
        return true
      }
      if (taskStatus === 'completed' || taskStatus === 'success') {
        const res = task.result || {}
        if (res.success === false) {
          errorMessage.value = res.message || '压缩失败'
          submitting.value = false
          return true
        }
        const data = res.data || {}
        ElMessage.success('压缩包创建成功')
        emit('compressed', {
          sourceName: props.file.name,
          archiveName: data.archiveName || archiveName.value.trim() || `${props.file.name}.zip`,
          path: props.currentPath === '/' ? '' : props.currentPath.slice(1),
        })
        submitting.value = false
        close()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const timer = setInterval(async () => {
    const done = await poll()
    if (done) {
      clearInterval(timer)
      pollTimer.value = null
    }
  }, 2000)
  pollTimer.value = timer
}

watch(
  () => props.visible,
  (val) => {
    if (val) resetForm()
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
