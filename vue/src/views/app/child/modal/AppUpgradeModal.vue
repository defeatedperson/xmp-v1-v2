<template>
  <Teleport to="body">
    <div class="modal-overlay">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <div>
          <h2>升级应用</h2>
        </div>
        <div class="header-buttons">
          <button class="close-button" @click="close" :disabled="loading">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="container-banner">
          <div class="banner-icon">
            <i class="fas fa-arrow-alt-circle-up"></i>
          </div>
          <div class="banner-content">
            <span class="banner-label">当前升级容器</span>
            <span class="banner-value">{{ containerName || containerId }}</span>
          </div>
        </div>

        <div v-if="loading" class="loading-container">
          <div class="loading-spinner"></div>
          <p>加载版本信息中...</p>
        </div>
        <div v-else class="content-wrapper">
          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-tag"></i> 选择升级版本</h3>
            </div>
            <div class="section-content">
              <div class="version-select-row">
                <select class="input version-select" v-model="selectedVersionIndex">
                  <option v-for="(v, idx) in versionList" :key="idx" :value="idx">{{ v.version }}</option>
                </select>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-exchange-alt"></i> 镜像对比</h3>
            </div>
            <div class="section-content">
              <div class="compare-list">
                <div class="compare-item">
                  <div class="compare-label">
                    <span class="dot current"></span>
                    当前镜像
                  </div>
                  <div class="compare-value pill">{{ currentImage }}</div>
                </div>
                <div class="compare-item">
                  <div class="compare-label">
                    <span class="dot next"></span>
                    新版本镜像
                  </div>
                  <div class="compare-value pill highlight">{{ nextImage }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="hint warning-hint upgrade-tip">
            <i class="fas fa-exclamation-triangle hint-icon"></i>
            <div class="hint-content">
              <p>升级会导致业务短暂中断，请确保在非核心业务时段操作。升级进度请前往“任务中心”查看。</p>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="mini-btn" @click="close" :disabled="loading">取消</button>
        <button class="mini-btn primary" @click="submit" :disabled="loading || !nextImage">开始升级</button>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  nodeId: { type: String, required: true },
  containerId: { type: String, required: true },
  containerName: { type: String, required: false },
  versions: { type: Array, required: true },
  currentImage: { type: String, required: true }
})
const emit = defineEmits(['close', 'submitted'])

const loading = ref(false)
const selectedVersionIndex = ref(0)

const versionList = computed(() => Array.isArray(props.versions) ? props.versions : [])
const nextImage = computed(() => {
  const v = versionList.value[selectedVersionIndex.value] || null
  return String(v?.image || '')
})

const isSemver = (v) => { if (!v || typeof v !== 'string') return false; return /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(v) }
const compareSemver = (a, b) => {
  if (!isSemver(a) || !isSemver(b)) return 0
  const pa = a.split(/[+-]/)[0].split('.').map(n => parseInt(n, 10))
  const pb = b.split(/[+-]/)[0].split('.').map(n => parseInt(n, 10))
  for (let i = 0; i < 3; i++) { const da = pa[i] || 0; const db = pb[i] || 0; if (da > db) return 1; if (da < db) return -1 }
  return 0
}

const pickLatestIndex = () => {
  const list = versionList.value
  if (!list.length) return 0
  const semvers = list.map((v, idx) => ({ idx, v: String(v.version || '') })).filter(x => isSemver(x.v))
  if (!semvers.length) return 0
  let best = semvers[0]
  for (const cur of semvers) { if (compareSemver(cur.v, best.v) > 0) best = cur }
  return best.idx
}

onMounted(() => { selectedVersionIndex.value = pickLatestIndex() })
watch(versionList, () => { selectedVersionIndex.value = pickLatestIndex() })

const close = () => { if (!loading.value) emit('close') }

const submit = async () => {
  if (!props.nodeId || !props.containerId) { ElMessage.error('缺少节点或容器信息'); return }
  if (!nextImage.value.trim()) { ElMessage.error('新版本镜像不可用'); return }
  try {
    loading.value = true
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/upgrade`
    const body = { image: nextImage.value.trim() }
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '升级任务创建失败')
    const taskId = data && data.data && data.data.taskId ? data.data.taskId : ''
    ElMessage.success(taskId ? `任务已创建：${taskId}` : '任务已创建')
    emit('submitted', { taskId, image: nextImage.value.trim() })
    emit('close')
  } catch (e) {
    ElMessage.error(e.message || '升级任务创建失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
@import '@/assets/styles/modal-common.css';

.modal-container { width: 780px; max-width: 95vw; height: 70vh; max-height: 680px; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 24px 0 24px; }
.modal-body { flex: 1; overflow-y: auto; padding: 0 24px 24px 24px; }

.container-banner { display: flex; align-items: center; gap: 16px; background: linear-gradient(to right, var(--el-color-primary-light-9), var(--el-fill-color-dark)); border: 1px solid var(--el-color-primary-light-8); border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; }
.banner-icon { width: 42px; height: 42px; border-radius: 10px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: var(--el-box-shadow-light); }
.banner-content { display: flex; flex-direction: column; gap: 4px; }
.banner-label { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 500; }
.banner-value { font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); font-family: 'Monaco', 'Menlo', monospace; letter-spacing: 0.5px; }

.content-wrapper { display: flex; flex-direction: column; gap: 16px; }
.section { display: flex; flex-direction: column; gap: 16px; background: var(--el-fill-color-lighter); border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 20px; transition: border-color 0.3s; }
.section:hover { border-color: var(--el-color-primary-light-5); }

.section-header { display: flex; justify-content: space-between; align-items: center; }
.section-title { margin: 0; color: var(--el-text-color-primary); font-size: 14px; display: flex; align-items: center; gap: 8px; }
.section-title i { color: var(--el-color-primary); font-size: 13px; }

.section-content { display: flex; flex-direction: column; gap: 12px; }

.version-select-row { display: flex; align-items: center; gap: 16px; }
.version-select { flex: 1; max-width: 300px; background: var(--el-fill-color-light); border: 1px solid var(--el-border-color); color: var(--el-text-color-primary); border-radius: 8px; padding: 8px 12px; font-size: 14px; outline: none; transition: all 0.2s; }
.version-select:focus { border-color: var(--el-color-primary); box-shadow: 0 0 0 2px var(--el-color-primary-light-9); }
.muted { color: var(--el-text-color-secondary); font-size: 13px; }

.compare-list { display: flex; flex-direction: column; gap: 8px; }
.compare-item { display: flex; flex-direction: column; gap: 6px; }
.compare-label { font-size: 12px; color: var(--el-text-color-secondary); display: flex; align-items: center; gap: 8px; }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.dot.current { background: var(--el-text-color-secondary); }
.dot.next { background: var(--el-color-primary); }
.compare-value { background: var(--el-fill-color); border: 1px solid var(--el-border-color); color: var(--el-text-color-regular); border-radius: 8px; padding: 8px 12px; font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; word-break: break-all; }
.compare-value.highlight { border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.compare-arrow { display: flex; justify-content: center; color: var(--el-text-color-placeholder); font-size: 12px; padding: 2px 0; }

.hint { display: flex; align-items: flex-start; gap: 12px; color: var(--el-color-primary); font-size: 13px; background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-7); padding: 12px 16px; border-radius: 12px; }
.hint-icon { font-size: 16px; margin-top: 2px; }
.warning-hint { color: var(--el-color-warning); background: var(--el-color-warning-light-9); border: 1px solid var(--el-color-warning-light-7); }
.hint-content p { margin: 0 0 4px 0; line-height: 1.5; }
.hint-content p:last-child { margin-bottom: 0; }

.modal-footer { display: flex; justify-content: flex-end; padding: 0 24px 24px 24px; gap: 12px; }
.mini-btn { background: var(--el-button-bg-color); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color); padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
.mini-btn:hover:not(:disabled) { background: var(--el-button-hover-bg-color); color: var(--el-text-color-primary); border-color: var(--el-border-color-hover); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mini-btn.primary { background: var(--el-color-primary); border-color: var(--el-color-primary); color: var(--el-color-white); }
.mini-btn.primary:hover:not(:disabled) { background: var(--el-color-primary-light-3); border-color: var(--el-color-primary-light-3); transform: translateY(-1px); box-shadow: var(--el-box-shadow-light); }

.loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--el-text-color-secondary); }
.loading-spinner { width: 40px; height: 40px; border: 4px solid var(--el-border-color-extra-light); border-radius: 50%; border-top-color: var(--el-color-primary); animation: spin 1s ease-in-out infinite; margin-bottom: 15px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
