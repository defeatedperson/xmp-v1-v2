<template>
  <Teleport to="body">
    <div class="modal-overlay">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <h2>应用设置</h2>
        <div class="header-buttons">
          <button class="close-button" @click="closeModal" :disabled="loading">&times;</button>
        </div>
      </div>

      <div class="modal-body">
        <div class="container-banner">
          <div class="banner-icon">
            <i class="fas fa-cube"></i>
          </div>
          <div class="banner-content">
            <span class="banner-label">当前设置容器</span>
            <span class="banner-value">{{ info.name || containerId }}</span>
          </div>
        </div>

        <div v-if="loading" class="loading-container">
          <div class="loading-spinner"></div>
          <p>加载容器信息中...</p>
        </div>
        <div v-else-if="error" class="error-message">{{ error }}</div>
        <div v-else class="content-wrapper">
          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-play-circle"></i> 容器操作</h3>
            </div>
            <div class="section-content">
              <div class="status-row">
                <span class="muted">当前状态：{{ info.running ? '运行中' : '已停止' }}</span>
                <div class="action-buttons">
                  <button class="mini-btn" @click="startContainer" :disabled="actionLoading || info.running">启动</button>
                  <button class="mini-btn" @click="stopContainer" :disabled="actionLoading || !info.running">停止</button>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-trash-alt"></i> 危险操作</h3>
            </div>
            <div class="section-content">
              <div class="delete-options" v-if="confirmDeleteVisible">
                <div class="delete-toggle-row">
                  <div class="option-item">
                    <ToggleButton v-model="forceDelete" :disabled="actionLoading" label="强制删除" />
                  </div>
                  <div class="option-item">
                    <ToggleButton v-model="removeVolumes" :disabled="actionLoading" label="删除匿名卷" />
                  </div>
                  <div class="option-item">
                    <ToggleButton v-model="cleanBindMounts" :disabled="actionLoading || isProtectedContainer" label="清理挂载目录" />
                  </div>
                </div>
                <div v-if="!isProtectedContainer">
                  <div class="hint warning-hint delete-tip" v-if="cleanBindMounts">
                    <i class="fas fa-exclamation-triangle hint-icon"></i>
                    <span>“清理挂载目录”会清理所有程序数据（例如网站文件），删除后无法恢复</span>
                  </div>
                  <div class="hint warning-hint delete-tip" v-else>
                    <i class="fas fa-exclamation-triangle hint-icon"></i>
                    <span>未开启清理挂载目录：将保留挂载目录中的程序数据，之后可再次挂载使用</span>
                  </div>
                </div>
              </div>
              <div class="action-buttons">
                <button class="mini-btn danger" @click="showConfirmDelete" :disabled="actionLoading || confirmDeleteVisible">删除容器</button>
                <button v-if="confirmDeleteVisible" class="mini-btn danger" @click="confirmRemoveContainer" :disabled="actionLoading || countdown > 0">
                  确认删除 {{ countdown > 0 ? `(${countdown}s)` : '' }}
                </button>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-globe"></i> 访问控制</h3>
            </div>
            <div class="section-content">
              <div class="access-settings" v-if="!isHostNetwork">
                <div class="toggle-row">
                  <ToggleButton v-model="publicAccessDesired" :disabled="actionLoading" label="允许公网访问" />
                  <span class="muted">当前：{{ currentPublicAccess ? '开启' : '关闭' }}</span>
                </div>
                <div class="hint warning-hint" v-if="confirmAccessVisible">
                  <i class="fas fa-exclamation-triangle hint-icon"></i>
                  <span>这将会重建容器，请前往任务中心查看进度</span>
                </div>
                <div class="alert-danger" v-if="publicAccessDesired">
                  <i class="fas fa-shield-alt"></i>
                  已开启公网访问：请谨慎将运行环境公开，示例：php、mysql、redis
                </div>
                <div class="action-buttons">
                  <button class="mini-btn" @click="showConfirmAccess" :disabled="actionLoading || confirmAccessVisible || publicAccessDesired === currentPublicAccess">应用访问设置</button>
                  <button v-if="confirmAccessVisible" class="mini-btn btn-warning" @click="confirmUpdateAccess" :disabled="actionLoading || accessCountdown > 0">
                    确认应用 {{ accessCountdown > 0 ? `(${accessCountdown}s)` : '' }}
                  </button>
                </div>
              </div>
              <div v-else class="muted">Host 网络模式下访问控制不可用，服务将随宿主机网络暴露</div>
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-tachometer-alt"></i> 性能限制</h3>
            </div>
            <div class="section-content">
              <div class="performance-settings">
                <div class="toggle-row">
                  <ToggleButton v-model="performanceLimitEnabled" :disabled="actionLoading" label="开启性能限制" />
                  <span class="muted">当前：{{ performanceCurrentText }}</span>
                </div>
                <div class="performance-select-row" v-if="performanceLimitEnabled">
                  <label class="muted">预设方案：</label>
                  <select v-model.number="selectedPerformancePlan" :disabled="actionLoading" class="performance-select">
                    <option v-for="preset in performancePresets" :key="preset.value" :value="preset.value">
                      {{ preset.label }}
                    </option>
                  </select>
                </div>
                <div class="hint warning-hint" v-if="confirmPerformanceVisible">
                  <i class="fas fa-exclamation-triangle hint-icon"></i>
                  <span>这将会重建容器，请前往任务中心查看进度</span>
                </div>
                <div class="hint warning-hint" v-else-if="performanceLimitEnabled">
                  <i class="fas fa-exclamation-triangle hint-icon"></i>
                  <span>修改性能限制会触发容器重建，请在任务中心查看进度</span>
                </div>
                <div class="action-buttons">
                  <button class="mini-btn" @click="showConfirmPerformance" :disabled="actionLoading || confirmPerformanceVisible || !performanceSettingsChanged">应用性能设置</button>
                  <button v-if="confirmPerformanceVisible" class="mini-btn btn-warning" @click="confirmUpdatePerformance" :disabled="actionLoading || performanceCountdown > 0">
                    确认应用 {{ performanceCountdown > 0 ? `(${performanceCountdown}s)` : '' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import ToggleButton from '@/components/ToggleButton.vue'

const props = defineProps({ nodeId: { type: String, required: true }, containerId: { type: String, required: true } })
const emit = defineEmits(['close', 'updated'])

const loading = ref(false)
const error = ref('')
const info = ref({})

const isProtectedContainer = computed(() => {
  const raw = info.value && info.value.name ? String(info.value.name) : ''
  const name = raw.startsWith('/') ? raw.slice(1).toLowerCase() : raw.toLowerCase()
  if (!name) return false
  if (name === 'openresty') return true
  return /^php\d{2}$/.test(name)
})

const actionLoading = ref(false)
const confirmDeleteVisible = ref(false)
const countdown = ref(0)
let countdownTimer = null
const forceDelete = ref(false)
const removeVolumes = ref(true)
const cleanBindMounts = ref(true)
const publicAccessDesired = ref(false)

const performanceLimitEnabled = ref(false)
const selectedPerformancePlan = ref(1)
const performancePlanCurrent = ref(0)
const performancePresets = [
  { value: 1, label: '方案1：0.5核 / 1GB' },
  { value: 2, label: '方案2：1核 / 2GB' },
  { value: 3, label: '方案3：2核 / 4GB' },
  { value: 4, label: '方案4：4核 / 8GB' },
  { value: 5, label: '方案5：8核 / 8GB' }
]

const confirmAccessVisible = ref(false)
const accessCountdown = ref(0)
let accessCountdownTimer = null

const confirmPerformanceVisible = ref(false)
const performanceCountdown = ref(0)
let performanceCountdownTimer = null

const currentPublicAccess = computed(() => {
  const ports = info.value.ports || {}
  const keys = Object.keys(ports)
  let hasBindings = false
  let allLocalhost = true
  keys.forEach(k => {
    const arr = ports[k] || []
    if (Array.isArray(arr) && arr.length > 0) {
      hasBindings = true
      arr.forEach(b => {
        const ip = (b && b.HostIp) ? b.HostIp : '0.0.0.0'
        if (ip !== '127.0.0.1') allLocalhost = false
      })
    }
  })
  if (!hasBindings) return false
  return !allLocalhost
})

const isHostNetwork = computed(() => {
  const mode = (info.value && info.value.HostConfig && info.value.HostConfig.NetworkMode) || info.value.networkMode || ''
  if (String(mode).toLowerCase() === 'host') return true
  const nets = (info.value && info.value.NetworkSettings && info.value.NetworkSettings.Networks) || {}
  return Object.keys(nets).includes('host')
})

const performanceCurrentText = computed(() => {
  if (performancePlanCurrent.value === -1) return '自定义设置'
  if (performancePlanCurrent.value === 0) return '未限制'
  const found = performancePresets.find(p => p.value === performancePlanCurrent.value)
  return found ? found.label : '自定义设置'
})

const performanceSettingsChanged = computed(() => {
  const currentPlan = performanceLimitEnabled.value ? selectedPerformancePlan.value : 0
  return currentPlan !== performancePlanCurrent.value
})

const fetchInfo = async () => {
  loading.value = true
  error.value = ''
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}`
    const res = await fetch(url)
    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      try {
        const errorData = await res.json()
        if (errorData.error) {
          errorMessage = errorData.error
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } catch { void 0 }
      throw new Error(errorMessage)
    }
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '获取容器信息失败')
    info.value = data.data || {}
    if (isProtectedContainer.value) {
      cleanBindMounts.value = false
    }
    publicAccessDesired.value = currentPublicAccess.value
    performanceLimitEnabled.value = false
    selectedPerformancePlan.value = 1
    performancePlanCurrent.value = 0
    try {
      const perfUrl = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/performance`
      const perfRes = await fetch(perfUrl)
      if (perfRes.ok) {
        const perfData = await perfRes.json()
        if (perfData && perfData.success && perfData.data) {
          const plan = Number(perfData.data.plan)
          if (Number.isFinite(plan)) {
            performancePlanCurrent.value = plan
            if (plan === 0) {
              performanceLimitEnabled.value = false
              selectedPerformancePlan.value = 1
            } else if (plan > 0) {
              performanceLimitEnabled.value = true
              selectedPerformancePlan.value = performancePresets.some(p => p.value === plan) ? plan : 1
            } else {
              performanceLimitEnabled.value = false
            }
          }
        }
      }
    } catch {
      performancePlanCurrent.value = 0
    }
  } catch (e) {
    error.value = e.message || '获取容器信息失败'
  } finally {
    loading.value = false
  }
}

const startContainer = async () => {
  actionLoading.value = true
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/start`
    const res = await fetch(url, { method: 'POST' })
    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      try {
        const errorData = await res.json()
        if (errorData.error) {
          errorMessage = errorData.error
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } catch { void 0 }
      throw new Error(errorMessage)
    }
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '启动失败')
    ElMessage.success('启动成功')
    emit('updated')
    await fetchInfo()
  } catch (e) {
    ElMessage.error(e.message || '启动失败')
  } finally {
    actionLoading.value = false
  }
}

const stopContainer = async () => {
  actionLoading.value = true
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/stop`
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeout: 10 }) })
    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      try {
        const errorData = await res.json()
        if (errorData.error) {
          errorMessage = errorData.error
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } catch { void 0 }
      throw new Error(errorMessage)
    }
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '停止失败')
    ElMessage.success('停止成功')
    emit('updated')
    await fetchInfo()
  } catch (e) {
    ElMessage.error(e.message || '停止失败')
  } finally {
    actionLoading.value = false
  }
}

const showConfirmDelete = () => {
  confirmDeleteVisible.value = true
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

const confirmRemoveContainer = async () => {
  if (countdown.value > 0) {
    ElMessage.warning(`请等待 ${countdown.value} 秒后再确认删除`)
    return
  }

  actionLoading.value = true
  try {
    const qs = new URLSearchParams({
      force: String(forceDelete.value),
      removeVolumes: String(removeVolumes.value),
      cleanBinds: String(isProtectedContainer.value ? false : cleanBindMounts.value)
    }).toString()
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}?${qs}`
    const res = await fetch(url, { method: 'DELETE' })
    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      try {
        const errorData = await res.json()
        if (errorData.error) {
          errorMessage = errorData.error
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } catch { void 0 }
      throw new Error(errorMessage)
    }
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '删除失败')
    ElMessage.success('删除成功')
    emit('updated')
    closeModal()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    actionLoading.value = false
    resetConfirmDelete()
  }
}

const resetConfirmDelete = () => {
  confirmDeleteVisible.value = false
  countdown.value = 0
  forceDelete.value = false
  removeVolumes.value = true
  cleanBindMounts.value = isProtectedContainer.value ? false : true
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

const showConfirmAccess = async () => {
  if (actionLoading.value) return
  actionLoading.value = true
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/networks`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '获取容器网络信息失败')
    const result = data.data || {}
    const nets = Array.isArray(result.networks) ? result.networks : []
    const hostMode = nets.some(n => String(n.name).toLowerCase() === 'host')
    if (hostMode) {
      ElMessage.error('Host 网络模式下访问控制不可用')
      return
    }
    confirmAccessVisible.value = true
    accessCountdown.value = 5
    ElMessage.info('请等待5秒后点击"确认应用"按钮完成访问设置')
    accessCountdownTimer = setInterval(() => {
      accessCountdown.value--
      if (accessCountdown.value <= 0) {
        clearInterval(accessCountdownTimer)
        accessCountdownTimer = null
      }
    }, 1000)
  } catch (e) {
    ElMessage.error(e.message || '无法确认网络类型，请稍后重试')
  } finally {
    actionLoading.value = false
  }
}

const confirmUpdateAccess = async () => {
  if (accessCountdown.value > 0) {
    ElMessage.warning(`请等待 ${accessCountdown.value} 秒后再确认应用`)
    return
  }

  actionLoading.value = true
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/upgrade`
    const body = {
      publicAccess: publicAccessDesired.value,
      networks: ['xmp-network'],
      performancePlan: performanceLimitEnabled.value ? selectedPerformancePlan.value : 0
    }
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      try {
        const errorData = await res.json()
        if (errorData.error) {
          errorMessage = errorData.error
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } catch { void 0 }
      throw new Error(errorMessage)
    }
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '更新访问设置失败')
    ElMessage.success('访问设置已应用，容器正在重建中，请前往任务中心查看进度')
    emit('updated')
    closeModal()
  } catch (e) {
    ElMessage.error(e.message || '更新访问设置失败')
  } finally {
    actionLoading.value = false
    resetConfirmAccess()
  }
}

const resetConfirmAccess = () => {
  confirmAccessVisible.value = false
  accessCountdown.value = 0
  if (accessCountdownTimer) {
    clearInterval(accessCountdownTimer)
    accessCountdownTimer = null
  }
}

const showConfirmPerformance = () => {
  confirmPerformanceVisible.value = true
  performanceCountdown.value = 5
  ElMessage.info('请等待5秒后点击"确认应用"按钮完成性能设置')
  performanceCountdownTimer = setInterval(() => {
    performanceCountdown.value--
    if (performanceCountdown.value <= 0) {
      clearInterval(performanceCountdownTimer)
      performanceCountdownTimer = null
    }
  }, 1000)
}

const confirmUpdatePerformance = async () => {
  if (performanceCountdown.value > 0) {
    ElMessage.warning(`请等待 ${performanceCountdown.value} 秒后再确认应用`)
    return
  }

  actionLoading.value = true
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/upgrade`
    const body = {
      publicAccess: publicAccessDesired.value,
      networks: ['xmp-network'],
      performancePlan: performanceLimitEnabled.value ? selectedPerformancePlan.value : 0
    }
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      try {
        const errorData = await res.json()
        if (errorData.error) {
          errorMessage = errorData.error
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } catch { void 0 }
      throw new Error(errorMessage)
    }
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '更新性能设置失败')
    ElMessage.success('性能设置已应用，容器正在重建中，请前往任务中心查看进度')
    emit('updated')
    closeModal()
  } catch (e) {
    ElMessage.error(e.message || '更新性能设置失败')
  } finally {
    actionLoading.value = false
    resetConfirmPerformance()
  }
}

const resetConfirmPerformance = () => {
  confirmPerformanceVisible.value = false
  performanceCountdown.value = 0
  if (performanceCountdownTimer) {
    clearInterval(performanceCountdownTimer)
    performanceCountdownTimer = null
  }
}

const closeModal = () => {
  if (!loading.value) {
    resetConfirmDelete()
    resetConfirmAccess()
    resetConfirmPerformance()
    emit('close')
  }
}

onMounted(() => { fetchInfo() })
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

.section-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { margin: 0; color: var(--el-text-color-primary); font-size: 14px; display: flex; align-items: center; gap: 8px; }
.section-title i { color: var(--el-color-primary); font-size: 13px; }

.section-content { display: flex; flex-direction: column; gap: 12px; }
.status-row { display: flex; justify-content: space-between; align-items: center; }
.muted { color: var(--el-text-color-secondary); font-size: 13px; }

.delete-options { display: flex; flex-direction: column; gap: 12px; }
.delete-toggle-row { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.option-item { color: var(--el-text-color-regular); font-size: 13px; }
.delete-tip { margin-top: 4px; }

.access-settings { display: flex; flex-direction: column; gap: 12px; }
.toggle-row { display: flex; justify-content: space-between; align-items: center; }

.performance-settings { display: flex; flex-direction: column; gap: 12px; }
.performance-select-row { display: flex; align-items: center; gap: 10px; }
.performance-select { padding: 4px 8px; border-radius: 6px; border: 1px solid var(--el-border-color); background: var(--el-bg-color); color: var(--el-text-color-primary); font-size: 13px; }

.hint { display: flex; align-items: center; gap: 8px; color: var(--el-color-primary); font-size: 12px; background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-7); padding: 8px 10px; border-radius: 8px; }
.hint-icon { font-size: 14px; }
.warning-hint { color: var(--el-color-warning); background: var(--el-color-warning-light-9); border: 1px solid var(--el-color-warning-light-7); }

.alert-danger { display: flex; align-items: center; gap: 8px; background: var(--el-color-danger-light-9); border: 1px solid var(--el-color-danger-light-7); color: var(--el-color-danger); padding: 10px 12px; border-radius: 8px; font-size: 12px; margin-top: 4px; }
.alert-danger i { font-size: 14px; }

.action-buttons { display: flex; gap: 10px; justify-content: flex-end; }

.mini-btn { background: var(--el-button-bg-color); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.mini-btn:hover:not(:disabled) { background: var(--el-button-hover-bg-color); color: var(--el-color-primary); border-color: var(--el-color-primary-light-7); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.mini-btn.danger { color: var(--el-color-danger); border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); }
.mini-btn.danger:hover:not(:disabled) { background: var(--el-color-danger-light-8); border-color: var(--el-color-danger); color: var(--el-color-danger-dark-2); }

.mini-btn.btn-warning { color: var(--el-color-warning); border-color: var(--el-color-warning-light-5); background: var(--el-color-warning-light-9); }
.mini-btn.btn-warning:hover:not(:disabled) { background: var(--el-color-warning-light-8); border-color: var(--el-color-warning); color: var(--el-color-warning-dark-2); }

.loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--el-text-color-secondary); }
.loading-spinner { width: 40px; height: 40px; border: 4px solid var(--el-border-color-extra-light); border-radius: 50%; border-top-color: var(--el-color-primary); animation: spin 1s ease-in-out infinite; margin-bottom: 15px; }
@keyframes spin { to { transform: rotate(360deg); } }

.error-message { color: var(--el-color-danger); background: var(--el-color-danger-light-9); border: 1px solid var(--el-color-danger-light-7); padding: 12px; border-radius: 8px; text-align: center; margin: 20px 0; }
.modal-footer { height: 24px; }
</style>
