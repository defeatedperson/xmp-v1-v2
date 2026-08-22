<template>
  <el-card class="container-connection-card" shadow="never">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <el-icon class="title-icon"><Connection /></el-icon>
          <span class="card-title">连接信息</span>
        </div>
      </div>
    </template>

    <div class="connection-info">
      <div class="info-item">
        <span class="label">容器名:</span>
        <div class="value-box">
          <code class="value">{{ containerName }}</code>
          <el-button link type="primary" :icon="CopyDocument" @click="copyToClipboard(containerName)" />
        </div>
      </div>

      <div class="info-item">
        <span class="label">容器IP:</span>
        <div class="value-box">
          <code class="value">{{ containerIp || '获取中...' }}</code>
          <el-button
            link
            type="primary"
            :icon="CopyDocument"
            @click="copyToClipboard(containerIp)"
            :disabled="!containerIp || containerIp.includes('失败')"
          />
        </div>
      </div>

      <div class="info-item">
        <span class="label">端口:</span>
        <div class="value-box">
          <code class="value">{{ port }}</code>
          <el-button link type="primary" :icon="CopyDocument" @click="copyToClipboard(port)" />
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, CopyDocument } from '@element-plus/icons-vue'

const props = defineProps({
  nodeId: {
    type: String,
    default: '',
  },
})

const containerName = 'mysql8'
const port = '3306'
const containerIp = ref('')

const fetchContainerIp = async () => {
  if (!props.nodeId) {
    containerIp.value = ''
    return
  }
  try {
    const resp = await fetch(`/api/forward/${props.nodeId}/docker/containers/${containerName}/networks`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const result = await resp.json()

    if (result && result.success) {
      if (result.data && Array.isArray(result.data.networks) && result.data.networks.length > 0) {
        containerIp.value = result.data.networks[0].ip || '未分配IP'
      } else {
        containerIp.value = '未分配IP'
      }
    } else {
      containerIp.value = '获取失败'
    }
  } catch (e) {
    console.error('获取容器IP失败:', e)
    containerIp.value = '获取失败'
  }
}

watch(() => props.nodeId, () => {
  containerIp.value = ''
  fetchContainerIp()
}, { immediate: true })

const copyToClipboard = async (text) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<style scoped>
.container-connection-card {
  margin-top: 0px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--el-color-primary);
}

.card-title {
  font-weight: 600;
  font-size: 15px;
}

.connection-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  width: 60px;
}

.value-box {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-fill-color-light);
  padding: 4px 12px;
  border-radius: 6px;
  min-height: 32px;
}

.value {
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  color: var(--el-text-color-primary);
}

:deep(.el-card__header) {
  padding: 12px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-card__body) {
  padding: 16px 20px;
}
</style>
