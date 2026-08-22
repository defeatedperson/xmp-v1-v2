<template>
  <div class="redis-page">
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          @error="handleNodeError"
          class="node-select-wrapper"
        />
        <div
          v-if="currentNodeId"
          class="status-indicator"
          title="点击刷新状态"
          @click="loadAll"
        >
          <el-tag :type="statusTagType" effect="dark" round class="status-tag clickable">
            <i :class="statusIcon" class="status-icon"></i>
            Redis: {{ statusText }}
          </el-tag>
        </div>
      </div>

      <div class="header-right">
        <el-button-group class="action-buttons">
          <el-button
            :icon="Refresh"
            @click="handleRefresh"
            :loading="loadingAll"
            title="刷新信息"
          >
            刷新
          </el-button>
          <el-button
            @click="handleFlush"
            :disabled="!canFlush"
            :loading="flushing"
            title="清空 Redis 缓存"
          >
            清空缓存
          </el-button>
          <el-button
            @click="handleRestart"
            :disabled="!canRestart"
            title="重启 Redis 服务"
          >
            重启服务
          </el-button>
          <el-button
            type="primary"
            @click="openChangePasswordModal"
            :disabled="!canChangePassword"
            title="修改 Redis 密码"
          >
            修改密码
          </el-button>
        </el-button-group>
      </div>
    </div>

    <div v-if="nodeError" class="node-error">
      {{ nodeError }}
    </div>

    <div
      class="cards-row"
      v-loading="loadingAll"
      element-loading-text="加载 Redis 信息中..."
      element-loading-background="rgba(0, 0, 0, 0.7)"
    >
      <el-card class="info-card">
        <template #header>
          <div class="card-header">
            <span>Redis 服务状态</span>
          </div>
        </template>
        <div class="status-info">
          <div class="info-row">
            <span class="label">服务状态</span>
            <span :class="['status-badge', statusBadgeClass]">
              {{ statusText }}
            </span>
          </div>
          <div class="info-row">
            <span class="label">容器镜像</span>
            <span class="value">
              {{ containerImage || '未知' }}
            </span>
          </div>
          <div class="info-row">
            <span class="label">启动时间</span>
            <span class="value">
              {{ containerStartedAt || '未知' }}
            </span>
          </div>
          <div class="info-row">
            <span class="label">状态描述</span>
            <span class="value">
              {{ redisStatusMessage || '-' }}
            </span>
          </div>
        </div>
        <div class="card-actions">
          <el-button
            size="small"
            type="success"
            @click="handleStart"
            :disabled="!canStart"
          >
            启动
          </el-button>
          <el-button
            size="small"
            type="danger"
            @click="handleStop"
            :disabled="!canStop"
          >
            停止
          </el-button>
          <el-button
            size="small"
            type="primary"
            @click="handleRestart"
            :disabled="!canRestart"
          >
            重启
          </el-button>
        </div>
      </el-card>

      <el-card class="info-card">
        <template #header>
          <div class="card-header">
            <span>连接信息</span>
          </div>
        </template>
        <div class="connection-info">
          <div class="info-row">
            <span class="label">容器名</span>
            <div class="value-container">
              <span class="value">
                {{ redisContainerName || 'redis' }}
              </span>
              <el-button
                link
                type="primary"
                :icon="CopyDocument"
                @click="copyToClipboard(redisContainerName || 'redis')"
              />
            </div>
          </div>
          <div class="info-row">
            <span class="label">容器 IP</span>
            <div class="value-container">
              <span class="value">
                {{ containerIp || containerIpError || '获取中' }}
              </span>
              <el-button
                link
                type="primary"
                :icon="CopyDocument"
                :disabled="!containerIp"
                @click="copyToClipboard(containerIp)"
              />
            </div>
          </div>
          <div class="info-row">
            <span class="label">端口</span>
            <div class="value-container">
              <span class="value">
                {{ redisPort }}
              </span>
              <el-button
                link
                type="primary"
                :icon="CopyDocument"
                @click="copyToClipboard(String(redisPort))"
              />
            </div>
          </div>
          <div class="info-row">
            <span class="label">密码</span>
            <div class="value-container">
              <span class="value">
                <span v-if="!redisPasswordVisible">
                  {{ redisPassword ? '••••••' : '未设置' }}
                </span>
                <span v-else>
                  {{ redisPassword || '未设置' }}
                </span>
              </span>
              <el-button
                link
                type="primary"
                :icon="redisPasswordVisible ? Hide : View"
                :disabled="!redisPassword"
                @click="togglePasswordVisible"
              />
              <el-button
                link
                type="primary"
                :icon="CopyDocument"
                :disabled="!redisPassword"
                @click="copyToClipboard(redisPassword)"
              />
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <RedisChangePasswordModal
      v-model:visible="passwordModalVisible"
      :node-id="currentNodeId"
      :has-password="!!redisPassword"
      @updated="handlePasswordUpdated"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, CopyDocument, View, Hide } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import RedisChangePasswordModal from './redis/RedisChangePasswordModal.vue'

const currentNodeId = ref('')
const nodeError = ref('')

const containerId = ref('')
const containerRunning = ref(false)
const containerImage = ref('')
const containerStartedAt = ref('')
const loadingStatus = ref(false)

const containerIp = ref('')
const containerIpError = ref('')
const loadingConnection = ref(false)

const redisStatus = ref('')
const redisStatusMessage = ref('')
const redisContainerName = ref('redis')
const redisPort = ref(6379)
const redisPassword = ref('')
const redisPasswordVisible = ref(false)
const redisPasswordSource = ref('')
const loadingAdmin = ref(false)
const flushing = ref(false)
const passwordModalVisible = ref(false)

const loadingAll = computed(() => loadingStatus.value || loadingConnection.value || loadingAdmin.value)

const hasNode = computed(() => !!currentNodeId.value)
const hasContainer = computed(() => !!containerId.value)

const statusText = computed(() => {
  if (!hasNode.value) return '未选择节点'
  if (!hasContainer.value) return '未发现容器'
  if (redisStatus.value) return redisStatus.value
  return containerRunning.value ? '运行中' : '已停止'
})

const statusTagType = computed(() => {
  switch (statusText.value) {
    case '正常':
    case '运行中':
      return 'success'
    case '未启动':
    case '已停止':
      return 'warning'
    case '未选择节点':
    case '未发现容器':
      return 'info'
    default:
      return 'danger'
  }
})

const statusIcon = computed(() => {
  switch (statusText.value) {
    case '正常':
    case '运行中':
      return 'fas fa-check-circle'
    case '未启动':
    case '已停止':
      return 'fas fa-pause-circle'
    case '未选择节点':
    case '未发现容器':
      return 'fas fa-question-circle'
    default:
      return 'fas fa-exclamation-triangle'
  }
})

const statusBadgeClass = computed(() => {
  switch (statusTagType.value) {
    case 'success':
      return 'running'
    case 'warning':
      return 'stopped'
    case 'info':
      return 'info'
    default:
      return 'error'
  }
})

const canStart = computed(() => hasNode.value && hasContainer.value && !containerRunning.value)
const canStop = computed(() => hasNode.value && hasContainer.value && containerRunning.value)
const canRestart = computed(() => hasNode.value && hasContainer.value && containerRunning.value)
const canFlush = computed(() => hasNode.value && hasContainer.value && containerRunning.value)
const canChangePassword = computed(() => hasNode.value && hasContainer.value && containerRunning.value)

const fetchContainerInfo = async () => {
  if (!hasNode.value) return
  loadingStatus.value = true
  try {
    const res = await fetch(`/api/forward/${currentNodeId.value}/docker/containers/redis`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const data = json && json.data ? json.data : null
    if (!data) {
      containerId.value = ''
      containerRunning.value = false
      containerImage.value = ''
      containerStartedAt.value = ''
      return
    }
    containerId.value = String(data.containerId || '')
    containerRunning.value = !!data.running
    containerImage.value = data.image || ''
    if (data.started) {
      try {
        const t = new Date(data.started)
        containerStartedAt.value = t.toLocaleString('zh-CN')
      } catch {
        containerStartedAt.value = ''
      }
    } else {
      containerStartedAt.value = ''
    }
  } catch {
    containerId.value = ''
    containerRunning.value = false
    containerImage.value = ''
    containerStartedAt.value = ''
  } finally {
    loadingStatus.value = false
  }
}

const fetchContainerNetworks = async () => {
  if (!hasNode.value) {
    containerIp.value = ''
    containerIpError.value = ''
    return
  }
  loadingConnection.value = true
  try {
    const res = await fetch(`/api/forward/${currentNodeId.value}/docker/containers/redis/networks`)
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      if (json && json.success === false && json.error && json.error.includes('no such container')) {
        throw new Error(json.message || '获取容器网络信息失败')
      }
      throw new Error(`HTTP ${res.status}`)
    }
    const json = await res.json()
    if (json && json.success && json.data && Array.isArray(json.data.networks)) {
      if (json.data.networks.length > 0) {
        containerIp.value = json.data.networks[0].ip || ''
        containerIpError.value = ''
      } else {
        containerIp.value = ''
        containerIpError.value = '未分配 IP'
      }
    } else {
      containerIp.value = ''
      containerIpError.value = '获取失败，请尝试刷新'
    }
  } catch (e) {
    containerIp.value = ''
    containerIpError.value = '获取失败，请尝试刷新'
    try {
      ElMessage.error(e.message || '获取容器网络信息失败')
    } catch {
      void 0
    }
  } finally {
    loadingConnection.value = false
  }
}

const fetchRedisInfo = async () => {
  if (!hasNode.value) return
  loadingAdmin.value = true
  try {
    const res = await fetch(`/api/forward/${currentNodeId.value}/redis/admin/info`)
    const json = await res.json()
    if (!res.ok || (json && json.success === false)) {
      const msg = (json && json.message) || `HTTP ${res.status}`
      throw new Error(msg)
    }
    const data = json && json.data ? json.data : json
    redisStatus.value = data.status || ''
    redisStatusMessage.value = data.message || ''
    redisContainerName.value = data.containerName || 'redis'
    redisPort.value = data.port || 6379
    redisPassword.value = data.password || ''
    redisPasswordSource.value = data.passwordSource || ''
  } catch (e) {
    redisStatus.value = ''
    redisStatusMessage.value = ''
    redisContainerName.value = 'redis'
    redisPort.value = 6379
    redisPassword.value = ''
    redisPasswordSource.value = ''
    try {
      ElMessage.error(e.message || '获取 Redis 信息失败')
    } catch {
      void 0
    }
  } finally {
    loadingAdmin.value = false
  }
}

const loadAll = async () => {
  if (!hasNode.value) return
  await Promise.all([fetchContainerInfo(), fetchContainerNetworks(), fetchRedisInfo()])
}

const handleNodeSelected = (node) => {
  currentNodeId.value = node && node.id ? String(node.id) : ''
  nodeError.value = ''
  containerId.value = ''
  containerRunning.value = false
  containerImage.value = ''
  containerStartedAt.value = ''
  containerIp.value = ''
  containerIpError.value = ''
  redisStatus.value = ''
  redisStatusMessage.value = ''
  redisContainerName.value = 'redis'
  redisPort.value = 6379
  redisPassword.value = ''
  redisPasswordSource.value = ''
  redisPasswordVisible.value = false
  if (currentNodeId.value) {
    loadAll()
  }
}

const handleNodeError = (message) => {
  nodeError.value = message || '节点加载失败'
  currentNodeId.value = ''
  containerId.value = ''
  containerRunning.value = false
  containerImage.value = ''
  containerStartedAt.value = ''
  containerIp.value = ''
  containerIpError.value = ''
  redisStatus.value = ''
  redisStatusMessage.value = ''
  redisContainerName.value = 'redis'
  redisPort.value = 6379
  redisPassword.value = ''
  redisPasswordSource.value = ''
  redisPasswordVisible.value = false
}

const handleRefresh = async () => {
  if (!hasNode.value) {
    ElMessage.warning('请先选择节点')
    return
  }
  await loadAll()
  ElMessage.success('Redis 信息已更新')
}

const handleFlush = async () => {
  if (!canFlush.value || flushing.value) return
  try {
    await ElMessageBox.confirm('确定要清空 Redis 缓存吗？该操作不可恢复。', '操作确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch (e) {
    if (e === 'cancel') return
    return
  }
  try {
    flushing.value = true
    const res = await fetch(`/api/forward/${currentNodeId.value}/redis/admin/flush`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    let json = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    if (!res.ok || (json && json.success === false)) {
      const msg = (json && json.message) || `HTTP ${res.status}`
      ElMessage.error(msg || '清空缓存失败')
      return
    }
    ElMessage.success('Redis 缓存已清空')
  } catch {
    ElMessage.error('清空缓存失败')
  } finally {
    flushing.value = false
  }
}

const handleStart = async () => {
  if (!canStart.value) return
  try {
    await ElMessageBox.confirm('确定要启动 Redis 服务吗？', '操作确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const res = await fetch(
      `/api/forward/${currentNodeId.value}/docker/containers/${containerId.value}/start`,
      { method: 'POST' }
    )
    if (!res.ok) {
      ElMessage.error('Redis 服务启动失败')
      return
    }
    ElMessage.success('Redis 服务启动成功')
    await loadAll()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error('Redis 服务启动失败')
  }
}

const handleStop = async () => {
  if (!canStop.value) return
  try {
    await ElMessageBox.confirm(
      '确定要停止 Redis 服务吗？停止后所有连接将会断开。',
      '操作确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    const res = await fetch(
      `/api/forward/${currentNodeId.value}/docker/containers/${containerId.value}/stop`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 10 })
      }
    )
    if (!res.ok) {
      ElMessage.error('Redis 服务停止失败')
      return
    }
    ElMessage.success('Redis 服务停止成功')
    await loadAll()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error('Redis 服务停止失败')
  }
}

const handleRestart = async () => {
  if (!canRestart.value) return
  try {
    await ElMessageBox.confirm(
      '确定要重启 Redis 服务吗？重启过程中服务将暂时不可用。',
      '操作确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    const stopRes = await fetch(
      `/api/forward/${currentNodeId.value}/docker/containers/${containerId.value}/stop`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 10 })
      }
    )
    if (!stopRes.ok) {
      ElMessage.error('Redis 服务停止失败，重启中断')
      await loadAll()
      return
    }
    const startRes = await fetch(
      `/api/forward/${currentNodeId.value}/docker/containers/${containerId.value}/start`,
      { method: 'POST' }
    )
    if (!startRes.ok) {
      ElMessage.error('Redis 服务启动失败，重启中断')
      await loadAll()
      return
    }
    ElMessage.success('Redis 服务重启成功')
    await loadAll()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error('Redis 服务重启失败')
    await loadAll()
  }
}

const togglePasswordVisible = () => {
  redisPasswordVisible.value = !redisPasswordVisible.value
}

const copyToClipboard = async (text) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

const openChangePasswordModal = () => {
  if (!canChangePassword.value) {
    ElMessage.warning('Redis 服务未运行')
    return
  }
  passwordModalVisible.value = true
}

const handlePasswordUpdated = async () => {
  await fetchRedisInfo()
}
</script>

<style scoped>
.redis-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-bg-color-overlay);
  padding: 16px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.node-select-wrapper {
  width: 220px;
}

.status-indicator {
  display: flex;
  align-items: center;
}

.status-tag {
  font-weight: 500;
  padding: 0 12px;
  height: 32px;
}

.status-tag.clickable {
  cursor: pointer;
  transition: all 0.3s;
}

.status-tag.clickable:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.status-icon {
  margin-right: 6px;
}

.cards-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.info-card {
  flex: 1 1 320px;
  min-width: 0;
  border-radius: var(--el-border-radius-base);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 500;
}

.status-info,
.connection-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.label {
  min-width: 80px;
  color: var(--el-text-color-secondary);
}

.value {
  color: var(--el-text-color-primary);
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 13px;
}

.status-badge.running {
  background-color: #10b981;
  color: #ffffff;
}

.status-badge.stopped {
  background-color: #f59e0b;
  color: #ffffff;
}

.status-badge.info {
  background-color: #4b5563;
  color: #e5e7eb;
}

.status-badge.error {
  background-color: #ef4444;
  color: #ffffff;
}

.card-actions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.value-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.value-container .value {
  flex: 1;
  padding: 4px 8px;
  border-radius: 4px;
  background-color: var(--el-bg-color-page);
  min-height: 28px;
  display: flex;
  align-items: center;
}

.node-error {
  margin-top: -8px;
  padding: 8px 12px;
  border-radius: 4px;
  background-color: #fee2e2;
  color: #b91c1c;
  font-size: 13px;
}

@media (max-width: 1000px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .header-left,
  .header-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
