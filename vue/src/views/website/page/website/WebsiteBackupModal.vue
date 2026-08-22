<template>
  <el-dialog
    v-model="visibleModel"
    title="备份管理"
    width="700px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="website-banner mb-4">
      <div class="banner-icon">
        <el-icon><Monitor /></el-icon>
      </div>
      <div class="banner-content">
        <span class="banner-label">当前网站</span>
        <span class="banner-value">{{ domain }}</span>
      </div>
    </div>

    <div v-loading="loading">
      <!-- 创建备份区域 -->
      <el-card shadow="never" class="mb-4">
        <template #header>
          <div class="card-header">
            <span>创建新备份</span>
          </div>
        </template>

        <div v-if="createConfirmVisible" class="confirm-box">
          <el-alert
            :title="`确认创建备份：${backupName || '自动生成名称'}`"
            type="warning"
            :closable="false"
            show-icon
            class="mb-2"
          />
          <div class="flex justify-end gap-2">
            <el-button @click="cancelCreateConfirm">取消</el-button>
            <el-button
              type="warning"
              @click="confirmCreateBackup"
              :disabled="createCountdown > 0"
              :loading="actionLoading"
            >
              确认创建 {{ createCountdown > 0 ? `(${createCountdown}s)` : '' }}
            </el-button>
          </div>
        </div>

        <div v-else class="flex gap-2">
          <el-input
            v-model="backupName"
            placeholder="备份名称 (留空则自动生成)"
            clearable
            @keyup.enter="showCreateConfirm"
          />
          <el-button type="primary" @click="showCreateConfirm">创建备份</el-button>
        </div>
      </el-card>

      <!-- 备份列表区域 -->
      <div class="section-header mb-2 flex justify-between items-center">
        <h3 class="text-sm font-bold">备份列表 ({{ backups.length }}/{{ MAX_BACKUPS }})</h3>
        <el-button :icon="Refresh" link @click="loadBackups">刷新列表</el-button>
      </div>

      <el-alert
        title="还原采用快照模式：先在容器内解压，成功后清空目标目录再复制。请谨慎操作！"
        type="warning"
        :closable="false"
        show-icon
        class="mb-4"
      />

      <div v-if="confirmVisible" class="confirm-box mb-4">
        <el-alert
          :title="`${actionType === 'delete' ? '确认删除备份' : '确认还原备份'}：${selectedBackupName}`"
          type="error"
          :closable="false"
          show-icon
          class="mb-2"
        />
        <div class="flex justify-end gap-2">
          <el-button @click="cancelConfirm">取消</el-button>
          <el-button
            :type="actionType === 'delete' ? 'danger' : 'warning'"
            @click="confirmAction"
            :disabled="countdown > 0"
            :loading="actionLoading"
          >
            确认{{ actionType === 'delete' ? '删除' : '还原' }} {{ countdown > 0 ? `(${countdown}s)` : '' }}
          </el-button>
        </div>
      </div>

      <el-table :data="backups" border stripe style="width: 100%" max-height="400">
        <el-table-column prop="name" label="备份名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="size" label="大小" width="100">
          <template #default="{ row }">
            {{ formatSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column prop="modifiedTime" label="修改时间" width="180">
          <template #default="{ row }">
            {{ formatModifiedTime(row.modifiedTime) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <el-button-group>
              <el-button link type="primary" @click="downloadBackup(row.name)">下载</el-button>
              <el-button link type="warning" @click="showConfirmRestore(row.name)" :disabled="confirmVisible">还原</el-button>
              <el-button link type="danger" @click="showConfirmDelete(row.name)" :disabled="confirmVisible">删除</el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Monitor, Refresh } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, required: true },
  domain: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

const visibleModel = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const loading = ref(false)
const actionLoading = ref(false)
const backups = ref([])
const backupName = ref('')
const MAX_BACKUPS = 30

const confirmVisible = ref(false)
const actionType = ref('') // 'delete' or 'restore'
const selectedBackupName = ref('')
const countdown = ref(0)

const createConfirmVisible = ref(false)
const createCountdown = ref(0)

let countdownTimer = null
let createCountdownTimer = null

const loadBackups = async () => {
  if (!props.nodeId || !props.domain) return

  try {
    loading.value = true
    const url = `/api/forward/${props.nodeId}/backup/websites/${encodeURIComponent(props.domain)}/list`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '获取备份列表失败')
    backups.value = Array.isArray(data.data) ? data.data : []
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const formatModifiedTime = (timeStr) => {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

const createBackup = async () => {
  try {
    actionLoading.value = true
    const url = `/api/forward/${props.nodeId}/backup/websites/${encodeURIComponent(props.domain)}/backup`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupName: backupName.value.trim() })
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '创建备份失败')
    ElMessage.success('备份任务已创建')
    backupName.value = ''
    await loadBackups()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

const deleteBackup = async (name) => {
  try {
    actionLoading.value = true
    const url = `/api/forward/${props.nodeId}/backup/websites/${encodeURIComponent(props.domain)}/${encodeURIComponent(name)}`
    const res = await fetch(url, { method: 'DELETE' })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '删除备份失败')
    ElMessage.success('删除成功')
    await loadBackups()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

const restoreBackup = async (name) => {
  try {
    actionLoading.value = true
    const url = `/api/forward/${props.nodeId}/backup/websites/${encodeURIComponent(props.domain)}/${encodeURIComponent(name)}/restore`
    const res = await fetch(url, { method: 'POST' })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '还原备份失败')
    ElMessage.success('还原任务已创建')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

const downloadBackup = async (name) => {
  try {
    const path = `backup/${props.domain}`
    const res = await fetch(`/api/forward/${props.nodeId}/file/download/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: 'file', name })
    })
    const data = await res.json()
    if (!data.success || !data.data?.token) throw new Error(data.message || '生成下载令牌失败')

    const downloadUrl = `/api/forward/${props.nodeId}/file/download?token=${encodeURIComponent(data.data.token)}`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = name
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    ElMessage.success('下载已开始')
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const showCreateConfirm = () => {
  createConfirmVisible.value = true
  createCountdown.value = 5
  createCountdownTimer = setInterval(() => {
    createCountdown.value--
    if (createCountdown.value <= 0) {
      clearInterval(createCountdownTimer)
    }
  }, 1000)
}

const cancelCreateConfirm = () => {
  createConfirmVisible.value = false
  if (createCountdownTimer) clearInterval(createCountdownTimer)
}

const confirmCreateBackup = async () => {
  await createBackup()
  cancelCreateConfirm()
}

const showConfirmDelete = (name) => {
  selectedBackupName.value = name
  actionType.value = 'delete'
  startActionCountdown()
}

const showConfirmRestore = (name) => {
  selectedBackupName.value = name
  actionType.value = 'restore'
  startActionCountdown()
}

const startActionCountdown = () => {
  confirmVisible.value = true
  countdown.value = 5
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
    }
  }, 1000)
}

const cancelConfirm = () => {
  confirmVisible.value = false
  if (countdownTimer) clearInterval(countdownTimer)
}

const confirmAction = async () => {
  if (actionType.value === 'delete') {
    await deleteBackup(selectedBackupName.value)
  } else {
    await restoreBackup(selectedBackupName.value)
  }
  cancelConfirm()
}

watch(() => props.modelValue, (val) => {
  if (val) {
    loadBackups()
    cancelConfirm()
    cancelCreateConfirm()
  }
})
</script>

<style scoped>
.mb-4 { margin-bottom: 1rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mr-1 { margin-right: 0.25rem; }
.flex { display: flex; }
.gap-2 { gap: 0.5rem; }
.justify-end { justify-content: flex-end; }
.justify-between { justify-content: space-between; }
.items-center { align-items: center; }

.confirm-box {
  background: var(--el-color-warning-light-9);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--el-color-warning-light-5);
}

.website-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  background: linear-gradient(to right, var(--el-color-primary-light-9), transparent);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px 20px;
}

.banner-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.banner-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.banner-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.banner-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
}
</style>
