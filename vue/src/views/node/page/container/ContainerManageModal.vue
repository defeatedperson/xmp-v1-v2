<template>
  <el-dialog
    v-model="visible"
    title="容器管理"
    width="800px"
    :before-close="handleClose"
    class="manage-modal"
  >
    <div class="manage-body" v-loading="loading">
      <div v-if="error" class="error-text">
        <el-alert :title="error" type="error" show-icon :closable="false" />
      </div>

      <div v-else class="content-wrapper">
        <el-tabs v-model="activeTab" class="manage-tabs">
          <el-tab-pane label="概览" name="overview">
            <div class="overview-section">
              <el-descriptions border :column="2">
                <el-descriptions-item label="名称">{{ info.name || '-' }}</el-descriptions-item>
                <el-descriptions-item label="镜像">{{ info.image || '-' }}</el-descriptions-item>
                <el-descriptions-item label="状态">{{ info.status || '-' }}</el-descriptions-item>
                <el-descriptions-item label="运行中">
                  <el-tag :type="info.running ? 'success' : 'danger'">{{ info.running ? '是' : '否' }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="创建时间">{{ formatDate(info.created) }}</el-descriptions-item>
                <el-descriptions-item label="启动时间">{{ formatDateStr(info.started) }}</el-descriptions-item>
              </el-descriptions>

              <div class="sub-section">
                <h3>端口</h3>
                <div class="pill-list">
                  <el-tag v-for="p in portsDisplay" :key="p" size="small">{{ p }}</el-tag>
                  <span v-if="portsDisplay.length === 0" class="muted">未检测到端口映射：容器可能处于 host 网络。</span>
                </div>
              </div>

              <div class="sub-section">
                <h3>挂载</h3>
                <div class="pill-list">
                  <el-tag v-for="m in mountsDisplay" :key="m" size="small" type="info">{{ m }}</el-tag>
                  <span v-if="mountsDisplay.length === 0" class="muted">无挂载</span>
                </div>
              </div>

              <div class="sub-section">
                <h3>环境变量</h3>
                <div class="pill-list">
                  <el-tag v-for="e in envDisplay" :key="e" size="small" type="warning">{{ e }}</el-tag>
                  <span v-if="envDisplay.length === 0" class="muted">无环境变量</span>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="设置" name="settings">
            <div class="settings-container">
              <!-- 容器操作 -->
              <el-card class="box-card">
                <template #header>
                  <div class="card-header">
                    <span><el-icon><Operation /></el-icon> 容器操作</span>
                  </div>
                </template>
                <div class="status-row">
                  <span class="muted">当前状态：{{ info.running ? '运行中' : '已停止' }}</span>
                  <div class="action-buttons">
                    <el-button 
                      type="success" 
                      @click="startContainer" 
                      :disabled="actionLoading || info.running"
                      :loading="actionLoading"
                    >启动</el-button>
                    <el-button 
                      type="danger" 
                      @click="stopContainer" 
                      :disabled="actionLoading || !info.running"
                      :loading="actionLoading"
                    >停止</el-button>
                  </div>
                </div>
              </el-card>

              <!-- 删除区域 -->
              <el-card class="box-card delete-card">
                <template #header>
                  <div class="card-header">
                    <span><el-icon><Delete /></el-icon> 删除容器</span>
                  </div>
                </template>
                <div class="delete-content">
                  <div v-if="confirmDeleteVisible" class="delete-options">
                    <el-checkbox v-model="forceDelete" :disabled="actionLoading">强制删除</el-checkbox>
                    <el-checkbox v-model="removeVolumes" :disabled="actionLoading">删除匿名卷</el-checkbox>
                    <el-checkbox v-model="cleanBindMounts" :disabled="actionLoading || isProtectedContainer">清理挂载目录</el-checkbox>
                    
                    <el-alert
                      v-if="!isProtectedContainer"
                      :title="cleanBindMounts ? '警告：将会清理所有程序数据，删除后无法恢复' : '提示：未开启清理挂载目录，将保留数据'"
                      :type="cleanBindMounts ? 'warning' : 'info'"
                      show-icon
                      :closable="false"
                      class="mt-2"
                    />
                  </div>
                  
                  <div class="action-buttons mt-4">
                    <el-button 
                      v-if="!confirmDeleteVisible" 
                      type="danger" 
                      @click="showConfirmDelete" 
                      :disabled="actionLoading"
                    >删除</el-button>
                    
                    <div v-else class="confirm-actions">
                       <el-button @click="resetConfirmDelete">取消</el-button>
                       <el-button 
                         type="danger" 
                         @click="confirmRemoveContainer" 
                         :disabled="actionLoading || countdown > 0"
                         :loading="actionLoading"
                       >
                         确认删除 {{ countdown > 0 ? `(${countdown}s)` : '' }}
                       </el-button>
                    </div>
                  </div>
                </div>
              </el-card>

              <!-- 访问设置 -->
              <el-card class="box-card" v-if="!isHostNetwork">
                <template #header>
                  <div class="card-header">
                    <span><el-icon><Connection /></el-icon> 访问设置</span>
                  </div>
                </template>
                <div class="access-content">
                  <div class="toggle-row">
                    <el-switch 
                      v-model="publicAccessDesired" 
                      active-text="允许公网访问"
                      :disabled="actionLoading" 
                    />
                    <span class="muted">当前：{{ currentPublicAccess ? '开启' : '关闭' }}</span>
                  </div>
                  
                  <el-alert
                    v-if="confirmAccessVisible"
                    title="这将会重建容器，请前往任务中心查看进度"
                    type="warning"
                    show-icon
                    :closable="false"
                    class="mt-2"
                  />
                  
                  <el-alert
                    v-if="publicAccessDesired"
                    title="已开启公网访问：请谨慎将运行环境公开，示例：php、mysql、redis"
                    type="error"
                    show-icon
                    :closable="false"
                    class="mt-2"
                  />
                  
                  <div class="action-buttons mt-4">
                     <el-button 
                       v-if="!confirmAccessVisible"
                       type="primary" 
                       @click="showConfirmAccess" 
                       :disabled="actionLoading || publicAccessDesired === currentPublicAccess"
                     >应用访问设置</el-button>
                     
                     <div v-else class="confirm-actions">
                       <el-button @click="resetConfirmAccess">取消</el-button>
                       <el-button 
                         type="warning" 
                         @click="confirmUpdateAccess" 
                         :disabled="actionLoading || accessCountdown > 0"
                         :loading="actionLoading"
                       >
                         确认应用 {{ accessCountdown > 0 ? `(${accessCountdown}s)` : '' }}
                       </el-button>
                     </div>
                  </div>
                </div>
              </el-card>
              <el-alert v-else title="Host 网络模式下访问控制不可用，服务将随宿主机网络暴露" type="info" show-icon :closable="false" />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Operation, Delete, Connection } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, required: true },
  containerId: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue', 'updated'])

const visible = ref(false)
const loading = ref(false)
const error = ref('')
const info = ref({})
const activeTab = ref('overview')

// Actions state
const actionLoading = ref(false)

// Delete state
const confirmDeleteVisible = ref(false)
const countdown = ref(0)
let countdownTimer = null
const forceDelete = ref(false)
const removeVolumes = ref(true)
const cleanBindMounts = ref(true)

// Access state
const publicAccessDesired = ref(false)
const confirmAccessVisible = ref(false)
const accessCountdown = ref(0)
let accessCountdownTimer = null

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.nodeId && props.containerId) {
    activeTab.value = 'overview'
    fetchInfo()
  } else {
    resetStates()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const isProtectedContainer = computed(() => {
  const raw = info.value && info.value.name ? String(info.value.name) : ''
  const name = raw.startsWith('/') ? raw.slice(1).toLowerCase() : raw.toLowerCase()
  if (!name) return false
  if (name === 'openresty') return true
  return /^php\d{2}$/.test(name)
})

const portsDisplay = computed(() => {
  const ports = info.value.ports || {}
  const list = []
  Object.keys(ports).forEach(k => {
    const arr = ports[k] || []
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach(b => {
        const host = (b.HostIp ? b.HostIp + ':' : '') + (b.HostPort || '')
        const item = host ? host + '->' + k : k
        list.push(item)
      })
    } else {
      list.push(k)
    }
  })
  return list
})

const mountsDisplay = computed(() => {
  const mounts = info.value.mounts || []
  return mounts.map(m => {
    const src = m.Source || m.Name || ''
    const dst = m.Destination || ''
    const ro = m.RW === false ? ':ro' : ''
    return src && dst ? `${src}:${dst}${ro}` : dst || src
  })
})

const envDisplay = computed(() => {
  const env = info.value.env || []
  return Array.isArray(env) ? env : []
})

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

const fetchInfo = async () => {
  loading.value = true
  error.value = ''
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '获取容器信息失败')
    info.value = data.data || {}
    
    if (isProtectedContainer.value) {
      cleanBindMounts.value = false
    }
    publicAccessDesired.value = currentPublicAccess.value
  } catch (e) {
    error.value = e.message || '获取容器信息失败'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

const startContainer = async () => {
  actionLoading.value = true
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/start`
    const res = await fetch(url, { method: 'POST' })
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
    const res = await fetch(url, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ timeout: 10 }) 
    })
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

// Delete Logic
const showConfirmDelete = () => {
  confirmDeleteVisible.value = true
  countdown.value = 5
  ElMessage.info('请等待5秒后点击"确认删除"按钮')
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

const resetConfirmDelete = () => {
  confirmDeleteVisible.value = false
  countdown.value = 0
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  forceDelete.value = false
  removeVolumes.value = true
  cleanBindMounts.value = isProtectedContainer.value ? false : true
}

const confirmRemoveContainer = async () => {
  if (countdown.value > 0) return
  
  actionLoading.value = true
  try {
    const qs = new URLSearchParams({
      force: String(forceDelete.value),
      removeVolumes: String(removeVolumes.value),
      cleanBinds: String(isProtectedContainer.value ? false : cleanBindMounts.value)
    }).toString()
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}?${qs}`
    const res = await fetch(url, { method: 'DELETE' })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '删除失败')
    
    ElMessage.success('删除成功')
    emit('updated')
    handleClose()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    actionLoading.value = false
    resetConfirmDelete()
  }
}

// Access Logic
const showConfirmAccess = async () => {
  if (actionLoading.value) return
  actionLoading.value = true
  try {
    // Re-verify networks before showing confirm
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/networks`
    const res = await fetch(url)
    const data = await res.json()
    if (data.success) {
      const result = data.data || {}
      const nets = Array.isArray(result.networks) ? result.networks : []
      const hostMode = nets.some(n => String(n.name).toLowerCase() === 'host')
      if (hostMode) {
        ElMessage.error('Host 网络模式下访问控制不可用')
        return
      }
    }
    
    confirmAccessVisible.value = true
    accessCountdown.value = 5
    ElMessage.info('请等待5秒后点击"确认应用"按钮')
    accessCountdownTimer = setInterval(() => {
      accessCountdown.value--
      if (accessCountdown.value <= 0) {
        clearInterval(accessCountdownTimer)
        accessCountdownTimer = null
      }
    }, 1000)
  } catch {
    ElMessage.error('无法确认网络类型')
  } finally {
    actionLoading.value = false
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

const confirmUpdateAccess = async () => {
  if (accessCountdown.value > 0) return
  
  actionLoading.value = true
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/upgrade`
    const body = { publicAccess: publicAccessDesired.value, networks: ['xmp-network'] }
    const res = await fetch(url, { 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(body) 
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '更新失败')
    
    ElMessage.success('访问设置已应用，容器正在重建中')
    emit('updated')
    handleClose()
  } catch (e) {
    ElMessage.error(e.message || '更新失败')
  } finally {
    actionLoading.value = false
    resetConfirmAccess()
  }
}

const resetStates = () => {
  resetConfirmDelete()
  resetConfirmAccess()
  error.value = ''
  info.value = {}
}

const handleClose = () => {
  if (loading.value) return
  resetStates()
  visible.value = false
}

const formatDate = (ts) => {
  if (!ts) return '-'
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}
const formatDateStr = (s) => {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}
</script>

<style scoped>
.manage-body {
  min-height: 400px;
}
.sub-section {
  margin-top: 15px;
}
.sub-section h3 {
  font-size: 14px;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}
.pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.settings-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: bold;
}
.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.action-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.delete-options {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.confirm-actions {
  display: flex;
  gap: 10px;
}
.access-content {
  display: flex;
  flex-direction: column;
}
.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
</style>
