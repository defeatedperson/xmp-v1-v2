<template>
  <el-dialog
    v-model="visible"
    title="删除镜像"
    width="500px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <div class="modal-body">
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="mb-4"
      />

      <el-form label-position="top">
        <el-form-item label="镜像标签">
          <div class="image-info">{{ imageTag || imageId }}</div>
        </el-form-item>

        <el-alert
          title="此操作不可逆，请谨慎执行"
          type="warning"
          show-icon
          :closable="false"
          class="mb-4"
        />

        <el-form-item>
          <el-checkbox v-model="force" label="强制删除 (Force)" border />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose" :disabled="loading">取消</el-button>
        <el-button type="danger" @click="confirm" :loading="loading">删除</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  nodeId: {
    type: String,
    required: true
  },
  imageId: {
    type: String,
    required: true
  },
  imageTag: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'success'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const loading = ref(false)
const error = ref('')
const force = ref(false)

const handleClose = () => {
  if (!loading.value) {
    visible.value = false
  }
}

const confirm = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const url = `/api/forward/${props.nodeId}/docker/images/${props.imageId}?force=${force.value ? 'true' : 'false'}`
    const response = await fetch(url, { method: 'DELETE' })
    const data = await response.json().catch(() => ({ success: false, message: '请求失败' }))
    
    if (response.ok && data && data.success) {
      emit('success')
      visible.value = false
      return
    }
    
    const msg = data && data.message ? data.message : `HTTP ${response.status}`
    error.value = msg
  } catch (e) {
    error.value = e && e.message ? e.message : '删除失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.mb-4 {
  margin-bottom: 16px;
}

.image-info {
  width: 100%;
  padding: 8px 12px;
  background-color: var(--el-fill-color-dark);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-regular);
  font-family: monospace;
  word-break: break-all;
}
</style>
