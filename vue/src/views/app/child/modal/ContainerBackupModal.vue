<template>
  <Teleport to="body">
    <div class="modal-overlay">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <h2>备份管理</h2>
        <div class="header-buttons">
          <button class="close-button" @click="close" :disabled="loading">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="container-banner">
          <div class="banner-icon">
            <i class="fas fa-cube"></i>
          </div>
          <div class="banner-content">
            <span class="banner-label">当前操作容器</span>
            <span class="banner-value">{{ containerName }}</span>
          </div>
        </div>

        <div v-if="loading" class="loading-container">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>
        <div v-else class="content-wrapper">
          <div class="section">
            <div class="section-header">
              <h3 class="section-title">创建备份</h3>
            </div>
            <div v-if="createConfirmVisible" class="confirm-bar">
              <div class="confirm-text">
                <i class="fas fa-exclamation-triangle"></i>
                <span>确认创建备份：{{ backupName || '自动生成名称' }}</span>
              </div>
              <div class="confirm-actions">
                <button class="mini-btn btn-warning" @click="confirmCreateBackup" :disabled="actionLoading || createCountdown > 0">
                  确认创建 {{ createCountdown > 0 ? `(${createCountdown}s)` : '' }}
                </button>
                <button class="mini-btn" @click="cancelCreateConfirm" :disabled="actionLoading">取消</button>
              </div>
            </div>
            <div class="row" v-else>
              <input class="input" v-model="backupName" placeholder="备份名称(可留空自动生成)" />
              <button class="mini-btn" @click="showCreateConfirm">创建</button>
            </div>
          </div>
          <div class="section">
            <div class="section-header">
              <h3 class="section-title">备份列表（{{ backups.length }}/{{ MAX_BACKUPS }}）</h3>
              <div class="header-actions">
                <div class="download-status" v-if="isDownloading">
                  <i class="fas fa-spinner fa-spin status-icon"></i>
                  <span class="status-text">正在打包下载，请稍候...</span>
                </div>
                <button class="mini-btn" @click="loadBackups">刷新</button>
              </div>
            </div>
            <div class="hint warning-hint">
              <i class="fas fa-exclamation-triangle hint-icon"></i>
              下载的文件是压缩包，如需使用管理页面的备份导入功能，请上传后进行解压。
            </div>
            <div class="hint warning-hint">
              <i class="fas fa-ban hint-icon"></i>
              备份还原仅支持绑定挂载（bind），不支持 Docker volume。
            </div>
            <div v-if="confirmVisible" class="confirm-bar">
              <div class="confirm-text">
                <i class="fas fa-exclamation-triangle"></i>
                <span>
                  {{ actionType === 'delete' ? '确认删除备份' : '确认还原备份' }}：{{ selectedBackupName }}
                </span>
              </div>
              <div class="confirm-actions">
                <button class="mini-btn btn-warning" @click="confirmAction" :disabled="actionLoading || countdown > 0">
                  确认{{ actionType === 'delete' ? '删除' : '还原' }} {{ countdown > 0 ? `(${countdown}s)` : '' }}
                </button>
                <button class="mini-btn" @click="cancelConfirm" :disabled="actionLoading">取消</button>
              </div>
            </div>
            <div class="list">
              <div class="row backup-item" v-for="b in backups" :key="b">
                <div class="name-time">
                  <span class="backup-name">{{ b }}</span>
                  <span class="backup-time" v-if="formatBackupTime(b)">{{ formatBackupTime(b) }}</span>
                </div>
                <div class="actions">
                  <button class="mini-btn" @click="downloadBackup(b)">下载</button>
                  <button class="mini-btn" @click="showConfirmRestore(b)" :disabled="confirmVisible">还原</button>
                  <button class="mini-btn danger" @click="showConfirmDelete(b)" :disabled="confirmVisible">删除</button>
                </div>
              </div>
              <div v-if="backups.length === 0" class="muted">暂无备份</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({ nodeId: { type: String, required: true }, containerId: { type: String, required: true }, containerName: { type: String, required: true } })
const emit = defineEmits(['close'])

const loading = ref(false)
const backups = ref([])
const backupName = ref('')
const isDownloading = ref(false)
const MAX_BACKUPS = 30
const actionLoading = ref(false)
const confirmVisible = ref(false)
const actionType = ref('')
const selectedBackupName = ref('')
const countdown = ref(0)
const createConfirmVisible = ref(false)
const createCountdown = ref(0)
let countdownTimer = null
let createCountdownTimer = null

const close = () => { if (!loading.value) emit('close') }

const loadBackups = async () => {
  try {
    loading.value = true
    const url = `/api/forward/${props.nodeId}/backup/containers/${encodeURIComponent(props.containerName)}/list`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '获取备份列表失败')
    backups.value = Array.isArray(data.data) ? data.data : []
  } catch (e) {
    ElMessage.error(e.message || '获取备份列表失败')
  } finally {
    loading.value = false
  }
}

const createBackup = async () => {
  try {
    loading.value = true
    const url = `/api/forward/${props.nodeId}/backup/containers/${encodeURIComponent(props.containerId)}/backup`
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backupName: backupName.value.trim() }) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '创建备份失败')
    ElMessage.success('备份任务已创建')
    await loadBackups()
  } catch (e) {
    ElMessage.error(e.message || '创建备份失败')
  } finally {
    loading.value = false
  }
}

const deleteBackup = async (name) => {
  try {
    loading.value = true
    const url = `/api/forward/${props.nodeId}/backup/containers/${encodeURIComponent(props.containerName)}/${encodeURIComponent(name)}`
    const res = await fetch(url, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || data.message || '删除备份失败')
    ElMessage.success('删除成功')
    await loadBackups()
  } catch (e) {
    ElMessage.error(e.message || '删除备份失败')
  } finally {
    loading.value = false
  }
}

const downloadBackup = async (name) => {
  if (isDownloading.value) return
  isDownloading.value = true
  try {
    const path = `backup/${props.containerName}`
    const res = await fetch(`/api/forward/${props.nodeId}/file/download/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, type: 'folder', name }) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success || !data.data || !data.data.token) throw new Error(data.error || data.message || '生成下载令牌失败')
    const startResp = await fetch(`/api/forward/${props.nodeId}/file/download?token=${encodeURIComponent(data.data.token)}`)
    const startJson = await startResp.json()
    if (!startJson.success || !startJson.taskId) throw new Error(startJson.error || '打包下载启动失败')
    const taskId = startJson.taskId
    let done = false
    while (!done) {
      await new Promise(r => setTimeout(r, 5000))
      const poll = await fetch(`/api/forward/${props.nodeId}/file-task/status?id=${taskId}`)
      const status = await poll.json()
      if (!status.success || !status.data) continue
      const task = status.data
      if (task.status === 'failed') {
        throw new Error(task.message || '打包失败')
      }
      if (task.status === 'completed') {
        done = true
        const res = task.result || {}
        const d = res.data || {}
        const rel = d.relativePath || ''
        if (!rel) throw new Error('打包结果缺失')
        const parent = rel.substring(0, rel.lastIndexOf('/'))
        const zipName = rel.substring(rel.lastIndexOf('/') + 1)
        const tokenResp2 = await fetch(`/api/forward/${props.nodeId}/file/download/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: parent, type: 'file', name: zipName }) })
        const tokenJson2 = await tokenResp2.json()
        if (!tokenJson2.success) throw new Error(tokenJson2.error || '生成打包下载令牌失败')
        const downloadUrl2 = `/api/forward/${props.nodeId}/file/download?token=${encodeURIComponent(tokenJson2.data.token)}`
        const link = document.createElement('a')
        link.href = downloadUrl2
        link.download = zipName
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        ElMessage.success('文件夹打包下载已开始')
      }
    }
  } catch (e) {
    ElMessage.error(e.message || '下载失败')
  } finally {
    isDownloading.value = false
  }
}

const restoreBackup = async (name) => {
  try {
    loading.value = true
    const url = `/api/forward/${props.nodeId}/backup/containers/${encodeURIComponent(props.containerName)}/${encodeURIComponent(name)}/restore`
    const body = { dataOnly: true, restart: true }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '还原备份失败')
    ElMessage.success('还原任务已创建')
  } catch (e) {
    ElMessage.error(e.message || '还原备份失败')
  } finally {
    loading.value = false
  }
}

const showConfirmDelete = (name) => {
  selectedBackupName.value = name
  actionType.value = 'delete'
  confirmVisible.value = true
  countdown.value = 5
  ElMessage.info('请等待5秒后点击"确认删除"按钮完成删除操作')
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

const showConfirmRestore = (name) => {
  selectedBackupName.value = name
  actionType.value = 'restore'
  confirmVisible.value = true
  countdown.value = 5
  ElMessage.info('请等待5秒后点击"确认还原"按钮完成还原操作')
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

const showCreateConfirm = () => {
  createConfirmVisible.value = true
  createCountdown.value = 5
  ElMessage.info('请等待5秒后点击"确认创建"按钮完成备份操作')
  createCountdownTimer = setInterval(() => {
    createCountdown.value--
    if (createCountdown.value <= 0) {
      clearInterval(createCountdownTimer)
      createCountdownTimer = null
    }
  }, 1000)
}

const cancelConfirm = () => {
  confirmVisible.value = false
  actionType.value = ''
  selectedBackupName.value = ''
  countdown.value = 0
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

const cancelCreateConfirm = () => {
  createConfirmVisible.value = false
  createCountdown.value = 0
  if (createCountdownTimer) {
    clearInterval(createCountdownTimer)
    createCountdownTimer = null
  }
}

const confirmAction = async () => {
  if (countdown.value > 0) {
    ElMessage.warning(`请等待 ${countdown.value} 秒后再确认`)
    return
  }
  actionLoading.value = true
  try {
    if (actionType.value === 'delete') {
      await deleteBackup(selectedBackupName.value)
    } else if (actionType.value === 'restore') {
      await restoreBackup(selectedBackupName.value)
    }
    cancelConfirm()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    actionLoading.value = false
  }
}

const confirmCreateBackup = async () => {
  if (createCountdown.value > 0) {
    ElMessage.warning(`请等待 ${createCountdown.value} 秒后再确认`)
    return
  }
  actionLoading.value = true
  try {
    await createBackup()
    cancelCreateConfirm()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    actionLoading.value = false
  }
}

onMounted(() => { loadBackups() })

const formatBackupTime = (name) => {
  const s = String(name || '')
  const m = s.match(/(\d{14})$/)
  if (!m) return ''
  const t = m[1]
  const y = t.slice(0,4)
  const mo = t.slice(4,6)
  const d = t.slice(6,8)
  const h = t.slice(8,10)
  const mi = t.slice(10,12)
  const se = t.slice(12,14)
  return `${y}-${mo}-${d} ${h}:${mi}:${se}`
}
</script>

<style scoped>
@import '@/assets/styles/modal-common.css';
.modal-container { width: 780px; max-width: 95vw; height: 70vh; max-height: 680px; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 24px 0 24px; }
.modal-body { flex: 1; overflow-y: auto; padding: 0 24px 24px 24px; }
.content-wrapper { display: flex; flex-direction: column; gap: 16px; }
.section { display: flex; flex-direction: column; gap: 16px; background: var(--el-fill-color-lighter); border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 20px; transition: border-color 0.3s; }
.section:hover { border-color: var(--el-color-primary-light-5); }
.container-banner { display: flex; align-items: center; gap: 16px; background: linear-gradient(to right, var(--el-color-primary-light-9), var(--el-fill-color-dark)); border: 1px solid var(--el-color-primary-light-8); border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; }
.banner-icon { width: 42px; height: 42px; border-radius: 10px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: var(--el-box-shadow-light); }
.banner-content { display: flex; flex-direction: column; gap: 4px; }
.banner-label { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 500; }
.banner-value { font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); font-family: 'Monaco', 'Menlo', monospace; letter-spacing: 0.5px; }
.section-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { margin: 0; color: var(--el-text-color-primary); font-size: 14px; }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 12px; }
.backup-item { justify-content: space-between; background: var(--el-fill-color-light); border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 12px 14px; transition: all 0.2s; }
.backup-item:hover { background: var(--el-fill-color); border-color: var(--el-border-color); transform: translateY(-1px); }
.name-time { display: flex; align-items: center; gap: 8px; }
.backup-name { color: var(--el-text-color-primary); font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 13px; letter-spacing: 0.2px; }
.backup-time { color: var(--el-color-primary); background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-7); padding: 2px 6px; border-radius: 6px; font-size: 12px; }
.actions { display: flex; align-items: center; gap: 8px; }
.muted { color: var(--el-text-color-secondary); padding-left: 2px; }
.modal-footer { display: flex; flex-direction: column; gap: 10px; padding: 0 24px 24px 24px; }
.action-row { display: flex; gap: 10px; justify-content: flex-end; }
.input { background: var(--el-input-bg-color); border: 1px solid var(--el-border-color); color: var(--el-text-color-primary); border-radius: 8px; padding: 10px 14px; flex: 1; font-size: 14px; transition: all 0.2s ease; }
.input:focus { border-color: var(--el-color-primary); outline: none; background: var(--el-input-bg-color); box-shadow: 0 0 0 3px var(--el-color-primary-light-9); }
.input::placeholder { color: var(--el-text-color-placeholder); }
.mini-btn { background: var(--el-button-bg-color); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.mini-btn:hover:not(:disabled) { background: var(--el-button-hover-bg-color); color: var(--el-color-primary); border-color: var(--el-color-primary-light-7); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mini-btn.danger { color: var(--el-color-danger); border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); }
.mini-btn.danger:hover:not(:disabled) { background: var(--el-color-danger-light-8); border-color: var(--el-color-danger); color: var(--el-color-danger-dark-2); }
.loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--el-text-color-secondary); }
.loading-spinner { width: 40px; height: 40px; border: 4px solid var(--el-border-color-extra-light); border-radius: 50%; border-top-color: var(--el-color-primary); animation: spin 1s ease-in-out infinite; margin-bottom: 15px; }
@keyframes spin { to { transform: rotate(360deg); } }

.header-actions { display: flex; align-items: center; gap: 12px; }
.download-status { display: flex; align-items: center; gap: 8px; background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-7); color: var(--el-color-primary); padding: 6px 10px; border-radius: 6px; }
.status-icon { font-size: 14px; }
.status-text { font-size: 12px; }
.confirm-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: var(--el-color-warning-light-9); border: 1px solid var(--el-color-warning-light-7); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; }
.confirm-text { display: flex; align-items: center; gap: 8px; color: var(--el-color-warning); font-size: 13px; }
.btn-warning { color: var(--el-color-warning); border-color: var(--el-color-warning-light-5); background: var(--el-color-warning-light-9); }
.btn-warning:hover:not(:disabled) { background: var(--el-color-warning-light-8); border-color: var(--el-color-warning); color: var(--el-color-warning-dark-2); }
.hint { display: flex; align-items: center; gap: 8px; color: var(--el-color-primary); font-size: 12px; background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-7); padding: 8px 10px; border-radius: 8px; }
.hint-icon { font-size: 14px; }
.warning-hint { display: flex; align-items: center; gap: 8px; color: var(--el-color-warning); font-size: 12px; background: var(--el-color-warning-light-9); border: 1px solid var(--el-color-warning-light-7); padding: 8px 10px; border-radius: 8px; }
</style>


