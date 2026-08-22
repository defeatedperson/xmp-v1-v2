<template>
  <el-dialog
    v-model="visible"
    title="镜像详情"
    width="700px"
    destroy-on-close
    @close="handleClose"
  >
    <div v-loading="loading" element-loading-text="加载镜像详情中...">
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="mb-4"
      />

      <div v-if="imageDetail && !loading" class="detail-container">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="ID">
            <span class="text-break">{{ imageDetail.id || 'N/A' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(imageDetail.created) }}
          </el-descriptions-item>
          <el-descriptions-item label="架构">
            {{ imageDetail.architecture || 'N/A' }}
          </el-descriptions-item>
          <el-descriptions-item label="操作系统">
            {{ imageDetail.os || 'N/A' }}
          </el-descriptions-item>
          <el-descriptions-item label="大小">
            {{ formatSize(imageDetail.size) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="download-section">
          <p class="download-tip">更多详细信息：</p>
          <el-button type="primary" plain icon="Download" @click="downloadFullData">
            下载完整数据 (JSON)
          </el-button>
        </div>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

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
  }
})

const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const loading = ref(false)
const error = ref('')
const imageDetail = ref(null)

const handleClose = () => {
  visible.value = false
}

const fetchImageDetail = async () => {
  if (!props.imageId || !props.nodeId) return

  loading.value = true
  error.value = ''
  imageDetail.value = null

  try {
    const response = await fetch(`/api/forward/${props.nodeId}/docker/images/${props.imageId}`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.message || '获取镜像详情失败')
    }

    imageDetail.value = data.data
  } catch (err) {
    error.value = err.message || '获取镜像详情时发生错误'
    console.error('获取镜像详情失败:', err)
  } finally {
    loading.value = false
  }
}

// Watch for visible change to fetch data if needed, though usually mount is enough if v-if is used on parent
watch(() => props.modelValue, (val) => {
  if (val && props.imageId) {
    fetchImageDetail()
  }
})

const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (dateValue) => {
  if (!dateValue) return 'N/A'
  const date = new Date(dateValue)
  if (isNaN(date.getTime())) {
    return '无效日期'
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const downloadFullData = () => {
  if (!imageDetail.value) return

  const dataStr = JSON.stringify(imageDetail.value, null, 2)
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)

  const exportFileDefaultName = `docker-image-${imageDetail.value.id.substring(0, 12)}.json`

  const linkElement = document.createElement('a')
  linkElement.setAttribute('href', dataUri)
  linkElement.setAttribute('download', exportFileDefaultName)
  linkElement.click()
}

onMounted(() => {
  if (props.modelValue) {
    fetchImageDetail()
  }
})
</script>

<style scoped>
.mb-4 {
  margin-bottom: 16px;
}

.text-break {
  word-break: break-all;
  font-family: monospace;
}

.download-section {
  margin-top: 24px;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
  text-align: center;
}

.download-tip {
  margin: 0 0 12px 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
