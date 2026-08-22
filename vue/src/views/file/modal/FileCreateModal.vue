<template>
  <el-dialog
    :model-value="visible"
    title="新建"
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

    <el-form label-position="top" :disabled="submitting">
      <el-form-item>
        <el-radio-group v-model="createType">
          <el-radio-button label="file">文件</el-radio-button>
          <el-radio-button label="directory">文件夹</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="createType === 'file' ? '文件名' : '文件夹名'">
        <el-input
          v-model="fileName"
          :placeholder="createType === 'file' ? '例如 example.txt' : '请输入文件夹名'"
          @keyup.enter="handleSubmit"
        />
      </el-form-item>

      <el-form-item v-if="createType === 'file'" label="文件内容（可选）">
        <el-input
          v-model="fileContent"
          type="textarea"
          :rows="6"
          placeholder="请输入文件内容..."
        />
      </el-form-item>

      <div class="path-info">
        <span class="path-label">创建位置</span>
        <span class="path-value">{{ displayPath }}</span>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="close" :disabled="submitting">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        创建
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createFileEntry, validateFileName } from '../tools/fileCreateTool'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: [String, Number], default: '' },
  currentPath: { type: String, default: '/' },
})

const emit = defineEmits(['update:visible', 'created'])

const createType = ref('file')
const fileName = ref('')
const fileContent = ref('')
const errorMessage = ref('')
const submitting = ref(false)

const displayPath = computed(() => (props.currentPath === '/' ? '根目录' : props.currentPath))

const resetForm = () => {
  createType.value = 'file'
  fileName.value = ''
  fileContent.value = ''
  errorMessage.value = ''
  submitting.value = false
}

const close = () => {
  if (!submitting.value) emit('update:visible', false)
}

const handleSubmit = async () => {
  if (submitting.value) return
  const validationError = validateFileName(fileName.value)
  if (validationError) {
    errorMessage.value = validationError
    return
  }
  if (!props.nodeId) {
    errorMessage.value = '请选择节点'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  const result = await createFileEntry({
    nodeId: props.nodeId,
    path: props.currentPath,
    type: createType.value,
    name: fileName.value,
    content: createType.value === 'file' ? fileContent.value : '',
  })
  submitting.value = false
  if (!result.success) {
    errorMessage.value = result.message || '创建失败'
    return
  }
  ElMessage.success(result.message || '创建成功')
  emit('created', result.data || null)
  close()
}

watch(
  () => props.visible,
  (val) => {
    if (val) resetForm()
  },
)
</script>

<style scoped>
.error-block {
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
