<template>
  <el-dialog
    v-model="visible"
    title="存储卷详情"
    width="600px"
    :before-close="handleClose"
    class="volume-detail-modal"
  >
    <div v-loading="loading" element-loading-text="正在加载详情...">
      <div v-if="detail.name" class="details-container">
        <div class="detail-item">
          <span class="label">名称</span>
          <span class="value">{{ detail.name }}</span>
        </div>
        <div class="detail-item">
          <span class="label">驱动</span>
          <span class="value">{{ detail.driver }}</span>
        </div>
        <div class="detail-item">
          <span class="label">挂载点</span>
          <span class="value">{{ detail.mountpoint }}</span>
        </div>
        <div class="detail-item">
          <span class="label">范围</span>
          <span class="value">{{ detail.scope }}</span>
        </div>
        <div class="detail-item">
          <span class="label">引用数</span>
          <span class="value">
            <el-tag size="small">{{ detail.usage?.refCount ?? 0 }}</el-tag>
          </span>
        </div>
        <div class="detail-item">
          <span class="label">容量</span>
          <span class="value">{{ formatSize(detail.usage?.size ?? 0) }}</span>
        </div>
        <div class="detail-item">
          <span class="label">创建时间</span>
          <span class="value">{{ formatDate(detail.created) }}</span>
        </div>

        <el-divider content-position="left">标签</el-divider>
        <div class="kv-container">
          <div v-if="!detail.labels || Object.keys(detail.labels).length === 0" class="empty-text">无标签信息</div>
          <div v-else class="kv-list">
            <div v-for="(v, k) in detail.labels" :key="k" class="kv-item">
              <el-tag type="info" size="small" class="key">{{ k }}</el-tag>
              <span class="separator">:</span>
              <span class="val">{{ v }}</span>
            </div>
          </div>
        </div>

        <el-divider content-position="left">选项</el-divider>
        <div class="kv-container">
          <div v-if="!detail.options || Object.keys(detail.options).length === 0" class="empty-text">无选项信息</div>
          <div v-else class="kv-list">
            <div v-for="(v, k) in detail.options" :key="k" class="kv-item">
              <el-tag type="warning" size="small" class="key">{{ k }}</el-tag>
              <span class="separator">:</span>
              <span class="val">{{ v }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, required: true },
  volumeName: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const loading = ref(false)
const detail = ref({})

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.volumeName) {
    loadDetail()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const handleClose = () => {
  visible.value = false
}

const loadDetail = async () => {
  loading.value = true
  detail.value = {}
  try {
    const resp = await fetch(`/api/forward/${props.nodeId}/docker/volumes/${encodeURIComponent(props.volumeName)}`)
    const data = await resp.json()
    if (resp.ok && data.success) {
      detail.value = data.data || {}
    } else {
      throw new Error(data.message || '获取存储卷详情失败')
    }
  } catch (e) {
    ElMessage.error(e.message || '请求详情失败')
    handleClose()
  } finally {
    loading.value = false
  }
}

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx++
  }
  return `${size.toFixed(2)} ${units[idx]}`
}

const formatDate = (isoOrTimestamp) => {
  if (!isoOrTimestamp) return '-'
  try {
    const d = new Date(isoOrTimestamp)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '-'
  }
}
</script>

<style scoped>
.details-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.label {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.value {
  color: var(--el-text-color-primary);
  font-weight: 500;
  word-break: break-all;
  text-align: right;
  max-width: 70%;
}

.kv-container {
  padding: 0 12px;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--el-fill-color-lighter);
  padding: 6px 10px;
  border-radius: 4px;
}

.key {
  font-family: monospace;
}

.separator {
  color: var(--el-text-color-placeholder);
}

.val {
  font-size: 13px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.empty-text {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  font-style: italic;
  text-align: center;
  padding: 10px 0;
}
</style>
