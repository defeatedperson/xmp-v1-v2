<template>
  <div class="active-container" v-loading="loading">
    <el-scrollbar height="100%">
      <div v-if="activeModules.length > 0" class="active-list">
        <template v-for="(mod, index) in activeModules" :key="index">
          <div v-if="mod.startsWith('[')" class="header-item">
            <el-divider content-position="left">
              <span class="header-text">{{ mod }}</span>
            </el-divider>
          </div>
          <div v-else class="active-item-wrapper">
            <div class="active-item-card">
              <span class="module-name">{{ mod }}</span>
            </div>
          </div>
        </template>
      </div>

      <el-empty
        v-else-if="!loading"
        :image-size="120"
        description="暂无已启用扩展数据"
      />

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="error-alert"
      />
    </el-scrollbar>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  nodeId: { type: String, default: '' },
  containerName: { type: String, default: '' },
})

const activeModules = ref([])
const loading = ref(false)
const error = ref('')

const loadActive = async () => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId || !containerName) {
    return
  }

  loading.value = true
  error.value = ''
  try {
    const url = `/api/forward/${encodeURIComponent(
      nodeId,
    )}/php/extensions/active?containerName=${encodeURIComponent(containerName)}`
    const resp = await fetch(url)
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '获取已启用扩展失败'
      throw new Error(msg)
    }
    const resData = result.data || {}
    // 兼容不同的返回格式：有些返回在 data.data.modules，有些在 data.modules
    const modules = Array.isArray(resData.modules)
      ? resData.modules
      : Array.isArray(resData.data && resData.data.modules)
        ? resData.data.modules
        : []
    activeModules.value = modules
  } catch (e) {
    error.value = String(e && e.message ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.nodeId, props.containerName],
  ([nodeId, containerName]) => {
    activeModules.value = []
    error.value = ''
    if (nodeId && containerName) {
      loadActive()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.active-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.active-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 16px;
}

.header-item {
  grid-column: 1 / -1;
  margin-top: 16px;
}

.header-item:first-child {
  margin-top: 0;
}

.header-text {
  font-weight: 600;
  color: var(--el-color-primary);
  font-size: 14px;
  letter-spacing: 0.5px;
}

.active-item-wrapper {
  display: flex;
}

.active-item-card {
  width: 100%;
  padding: 10px 14px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: default;
}

.active-item-card:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-lighter);
}

.active-item-card .module-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
}

.error-alert {
  margin: 16px;
}

:deep(.el-divider__text) {
  background-color: var(--el-bg-color) !important;
}

:deep(.el-divider--horizontal) {
  margin: 12px 0;
  border-top-color: var(--el-border-color-lighter);
}
</style>


