<template>
  <div class="security-setting">
    <el-card>
      <template #header>
        <div class="card-header">
          <span class="title">CA 证书管理</span>
          <el-button type="primary" @click="fetchCAInfo" :loading="loading" :icon="Refresh">刷新</el-button>
        </div>
      </template>

      <el-alert
        title="这是节点通信的安全核心，日常情况下不建议重新生成 CA。重新生成后需要手动更新所有被控节点的证书配置。"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 20px"
      />

      <el-descriptions :column="1" border v-if="caInfo">
        <el-descriptions-item label="CA 到期时间">
          <span :class="{ 'text-danger': isExpiringSoon }">
            {{ formatDate(caInfo.ca_expiry) }}
            <el-tag v-if="isExpiringSoon" type="danger" size="small" style="margin-left: 8px">即将过期</el-tag>
          </span>
        </el-descriptions-item>
      </el-descriptions>

      <el-empty v-else description="CA 未初始化" />

      <div class="action-area">
        <el-button
          type="danger"
          @click="handleRegenerate"
          :loading="regenerating"
          :disabled="!caInfo"
        >
          重新生成 CA
        </el-button>
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      title="确认重新生成 CA"
      width="500px"
    >
      <el-alert
        title="重新生成 CA 将影响所有被控节点的通信！"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      />
      <ul style="margin: 0; padding-left: 20px; color: var(--el-text-color-regular)">
        <li>重新生成后，原有证书将失效</li>
        <li>需要手动更新所有被控节点的证书配置</li>
        <li>更新期间主控无法下发配置到被控</li>
        <li>更新完成后自动恢复</li>
      </ul>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmRegenerate" :loading="regenerating">确认重新生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

const loading = ref(false)
const regenerating = ref(false)
const dialogVisible = ref(false)
const caInfo = ref(null)

const isExpiringSoon = computed(() => {
  if (!caInfo.value?.ca_expiry) return false
  const expiryDate = new Date(caInfo.value.ca_expiry)
  const now = new Date()
  const days = (expiryDate - now) / (1000 * 60 * 60 * 24)
  return days < 90
})

const fetchCAInfo = async () => {
  loading.value = true
  try {
    const response = await fetch('/api/set/caexpiry')
    const result = await response.json()

    if (result.success) {
      caInfo.value = {
        ca_expiry: result.notAfter
      }
    } else {
      ElMessage.error(result.message || '获取CA状态失败')
    }
  } catch {
    ElMessage.error('网络请求失败')
  } finally {
    loading.value = false
  }
}

const handleRegenerate = () => {
  dialogVisible.value = true
}

const confirmRegenerate = async () => {
  regenerating.value = true
  try {
    const response = await fetch('/api/set/regenca', {
      method: 'POST'
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success('CA 重新生成成功')
      dialogVisible.value = false
      fetchCAInfo()
    } else {
      ElMessage.error(result.message || '重新生成失败')
    }
  } catch {
    ElMessage.error('网络请求失败')
  } finally {
    regenerating.value = false
  }
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  fetchCAInfo()
})
</script>

<style scoped>
.security-setting {
  max-width: 800px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-weight: bold;
  font-size: 16px;
}

.action-area {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.text-danger {
  color: var(--el-color-danger);
}
</style>
