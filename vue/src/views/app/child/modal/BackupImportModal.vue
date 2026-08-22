<template>
  <Teleport to="body">
    <div class="modal-overlay">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <div>
          <h2 class="title">备份导入</h2>
        </div>
        <div class="header-buttons">
          <button class="close-button" @click="close" :disabled="loading">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="container-banner">
          <div class="banner-icon">
            <i class="fas fa-file-import"></i>
          </div>
          <div class="banner-content">
            <span class="banner-label">备份导入路径</span>
            <span class="banner-value">/backup/import</span>
          </div>
        </div>

        <div v-if="loading" class="loading-container">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>
        <div v-else class="content-wrapper">
          <div class="section">
            <div class="section-header">
              <h3 class="section-title">备份列表</h3>
              <div class="header-actions">
                <button class="mini-btn accent" @click="loadImports">刷新</button>
              </div>
            </div>
            <div class="hint">
              <i class="fas fa-info-circle hint-icon"></i>
              请将备份上传至上述路径。若为压缩包，请在文件管理中解压后再导入。
            </div>
            <div class="hint warning-hint">
              <i class="fas fa-ban hint-icon"></i>
              还原不支持 Docker volume，请使用绑定挂载（bind）后再备份与导入。
            </div>
            <div v-if="confirmVisible" class="confirm-bar">
              <div class="confirm-text">
                <i class="fas fa-exclamation-triangle"></i>
                <span>确认导入备份：{{ selectedBackupName }}</span>
              </div>
              <div class="confirm-actions">
                <button class="mini-btn btn-warning" @click="confirmAction" :disabled="actionLoading || countdown > 0">
                  确认导入 {{ countdown > 0 ? `(${countdown}s)` : '' }}
                </button>
                <button class="mini-btn" @click="cancelConfirm" :disabled="actionLoading">取消</button>
              </div>
            </div>
            <div class="list">
              <div class="row import-item" v-for="b in imports" :key="b.name">
                <div class="name-time">
                  <span class="import-name">{{ b.name }}</span>
                  <span class="import-time" v-if="formatBackupTime(b.name)">{{ formatBackupTime(b.name) }}</span>
                </div>
                <div class="actions">
                  <button class="mini-btn primary" @click="showConfirmRestore(b)" :disabled="confirmVisible || actionLoading">导入</button>
                </div>
              </div>
              <div v-if="imports.length === 0" class="muted">暂无可导入备份</div>
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

const props = defineProps({ nodeId: { type: String, required: true } })
const emit = defineEmits(['close'])

const loading = ref(false)
const actionLoading = ref(false)
const imports = ref([])
const confirmVisible = ref(false)
const selectedBackupName = ref('')
const countdown = ref(0)
let countdownTimer = null

const close = () => { if (!loading.value) emit('close') }

const loadImports = async () => {
  try {
    loading.value = true
    const url = `/api/forward/${props.nodeId}/backup/import/list`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '获取导入列表失败')
    imports.value = Array.isArray(data.data) ? data.data : []
  } catch (e) {
    ElMessage.error(e.message || '获取导入列表失败')
  } finally {
    loading.value = false
  }
}

const showConfirmRestore = (item) => {
  const name = item && item.name ? item.name : String(item || '')
  selectedBackupName.value = name
  confirmVisible.value = true
  countdown.value = 5
  ElMessage.info('请等待5秒后点击"确认导入"按钮完成导入操作')
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

const cancelConfirm = () => {
  confirmVisible.value = false
  selectedBackupName.value = ''
  countdown.value = 0
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

const confirmAction = async () => {
  if (countdown.value > 0) {
    ElMessage.warning(`请等待 ${countdown.value} 秒后再确认`)
    return
  }
  actionLoading.value = true
  try {
    const url = `/api/forward/${props.nodeId}/backup/import/${encodeURIComponent(selectedBackupName.value)}/restore`
    const body = { strict: true }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '导入备份失败')
    ElMessage.success('导入任务已创建')
    cancelConfirm()
  } catch (e) {
    ElMessage.error(e.message || '导入备份失败')
  } finally {
    actionLoading.value = false
  }
}

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

onMounted(() => { loadImports() })
</script>

<style scoped>
@import '@/assets/styles/modal-common.css';

.modal-container { width: 780px; max-width: 95vw; height: 70vh; max-height: 680px; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 24px 0 24px; }
.title { margin: 0; color: var(--el-text-color-primary); letter-spacing: 0.2px; }

.modal-body { flex: 1; overflow-y: auto; padding: 0 24px 24px 24px; }

.container-banner { display: flex; align-items: center; gap: 16px; background: linear-gradient(to right, var(--el-color-primary-light-9), var(--el-fill-color-dark)); border: 1px solid var(--el-color-primary-light-8); border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; }
.banner-icon { width: 42px; height: 42px; border-radius: 10px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: var(--el-box-shadow-light); }
.banner-content { display: flex; flex-direction: column; gap: 4px; }
.banner-label { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 500; }
.banner-value { font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); font-family: 'Monaco', 'Menlo', monospace; letter-spacing: 0.5px; }

.content-wrapper { display: flex; flex-direction: column; gap: 16px; }
.section { display: flex; flex-direction: column; gap: 16px; background: var(--el-fill-color-lighter); border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 20px; transition: border-color 0.3s; }
.section:hover { border-color: var(--el-color-primary-light-5); }

.section-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { margin: 0; color: var(--el-text-color-primary); font-size: 14px; }
.header-actions { display: flex; align-items: center; gap: 12px; }

.hint { display: flex; align-items: center; gap: 8px; color: var(--el-color-primary); font-size: 12px; background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-7); padding: 8px 10px; border-radius: 8px; }
.hint-icon { font-size: 14px; }
.warning-hint { display: flex; align-items: center; gap: 8px; color: var(--el-color-warning); font-size: 12px; background: var(--el-color-warning-light-9); border: 1px solid var(--el-color-warning-light-7); padding: 8px 10px; border-radius: 8px; }

.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 12px; }
.import-item { justify-content: space-between; background: var(--el-fill-color-light); border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 12px 14px; transition: all 0.2s; }
.import-item:hover { background: var(--el-fill-color); border-color: var(--el-border-color); transform: translateY(-1px); }

.name-time { display: flex; align-items: center; gap: 8px; }
.import-name { color: var(--el-text-color-primary); font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 13px; letter-spacing: 0.2px; }
.import-time { color: var(--el-color-primary); background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-7); padding: 2px 6px; border-radius: 6px; font-size: 12px; }

.actions { display: flex; align-items: center; gap: 8px; }
.muted { color: var(--el-text-color-secondary); padding-left: 2px; }

.modal-footer { display: flex; flex-direction: column; gap: 10px; padding: 0 24px 24px 24px; }
.action-row { display: flex; gap: 10px; justify-content: flex-end; }

.mini-btn { background: var(--el-button-bg-color); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.mini-btn:hover:not(:disabled) { background: var(--el-button-hover-bg-color); color: var(--el-color-primary); border-color: var(--el-color-primary-light-7); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.mini-btn.accent { color: var(--el-color-primary); border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); }
.mini-btn.accent:hover:not(:disabled) { background: var(--el-color-primary-light-8); border-color: var(--el-color-primary); color: var(--el-color-primary-dark-2); }

.mini-btn.primary { background: var(--el-color-success-light-9); color: var(--el-color-success); border-color: var(--el-color-success-light-5); }
.mini-btn.primary:hover:not(:disabled) { background: var(--el-color-success-light-8); border-color: var(--el-color-success); color: var(--el-color-success-dark-2); }

.mini-btn.btn-warning { color: var(--el-color-warning); border-color: var(--el-color-warning-light-5); background: var(--el-color-warning-light-9); }
.mini-btn.btn-warning:hover:not(:disabled) { background: var(--el-color-warning-light-8); border-color: var(--el-color-warning); color: var(--el-color-warning-dark-2); }

.confirm-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: var(--el-color-warning-light-9); border: 1px solid var(--el-color-warning-light-7); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; }
.confirm-text { display: flex; align-items: center; gap: 8px; color: var(--el-color-warning); font-size: 13px; }

.loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--el-text-color-secondary); }
.loading-spinner { width: 40px; height: 40px; border: 4px solid var(--el-border-color-extra-light); border-radius: 50%; border-top-color: var(--el-color-primary); animation: spin 1s ease-in-out infinite; margin-bottom: 15px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
