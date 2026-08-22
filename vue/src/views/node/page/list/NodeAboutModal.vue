<template>
  <el-dialog
    v-model="visible"
    title="程序版本详情"
    width="500px"
    :before-close="handleClose"
    destroy-on-close
  >
    <div v-loading="loading" class="about-content">
      <div v-if="error" class="error-text">
        <el-alert :title="error" type="error" :closable="false" show-icon />
      </div>
      <div v-else-if="jsonData" class="info-wrapper">
        <el-descriptions border column="1" direction="vertical">
          <el-descriptions-item label="版本信息">
            <span class="version-text">{{ jsonData.version || 'N/A' }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <el-empty v-else description="暂无数据" />
    </div>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="fetchAbout" :loading="loading" :icon="Refresh">刷新</el-button>
        <el-button @click="handleClose">关闭</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const loading = ref(false)
const error = ref('')
const jsonData = ref(null)

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.nodeId) {
    fetchAbout()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

let abortController = null

const fetchAbout = async () => {
  if (abortController) abortController.abort()
  abortController = new AbortController()

  loading.value = true
  error.value = ''
  jsonData.value = null

  try {
    const response = await fetch(`/api/forward/${props.nodeId}/version`, {
      signal: abortController.signal
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()

    jsonData.value = result
  } catch (err) {
    if (err.name === 'AbortError') return
    error.value = err.message || '网络请求失败'
  } finally {
    loading.value = false
  }
}

const handleClose = () => {
  visible.value = false
}

onUnmounted(() => {
  if (abortController) abortController.abort()
})
</script>

<style scoped>
.about-content {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.info-wrapper {
  padding: 10px 0;
}
.version-text {
  font-size: 18px;
  font-weight: bold;
  color: var(--el-color-primary);
  font-family: monospace;
}
.error-text {
  padding: 20px 0;
}
</style>
