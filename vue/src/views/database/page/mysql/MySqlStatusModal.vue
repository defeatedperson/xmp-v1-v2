<template>
  <el-dialog
    v-model="visible"
    title="MySQL 快捷操作"
    width="400px"
    destroy-on-close
    @close="handleClose"
  >
    <div v-loading="loading">
      <!-- 状态显示区域 -->
      <div class="status-display-area">
        <el-card shadow="never" :class="['status-card', `is-${statusType}`]">
          <div class="status-content">
            <div class="status-icon-wrapper">
              <el-icon :size="28" :class="`text-${statusType}`">
                <component :is="statusIconComponent" />
              </el-icon>
            </div>
            <div class="status-info">
              <div class="status-header">
                <span class="status-main-text">{{ statusTitle }}</span>
                <el-tag :type="statusType" size="small" effect="light" round>
                  {{ statusBadgeText }}
                </el-tag>
              </div>
              <div class="status-sub-text">{{ statusText }}</div>
            </div>
            <div class="status-action">
              <el-button
                circle
                :icon="Refresh"
                @click="fetchStatus"
                :loading="loading"
                size="small"
                title="刷新状态"
              />
            </div>
          </div>
        </el-card>
      </div>

      <!-- 操作按钮区域 -->
      <div class="actions-section">
        <div class="section-title">服务操作</div>
        <div class="action-buttons">
          <el-button
            type="success"
            :icon="VideoPlay"
            :disabled="loading || isRunning || !hasContainer"
            @click="handleStart"
            class="action-btn"
          >
            启动服务
          </el-button>

          <el-button
            type="danger"
            :icon="VideoPause"
            :disabled="loading || !isRunning || !hasContainer"
            @click="handleStop"
            class="action-btn"
          >
            停止服务
          </el-button>

          <el-button
            type="primary"
            :icon="RefreshRight"
            :disabled="loading || !hasContainer"
            @click="handleRestart"
            class="action-btn"
          >
            重启服务
          </el-button>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Refresh,
  VideoPlay,
  VideoPause,
  RefreshRight,
  CircleCheck,
  CircleClose,
  QuestionFilled,
  Loading
} from '@element-plus/icons-vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'refresh'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const loading = ref(false)
const mysqlStatus = ref('stopped') // running, stopped, restarting
const containerId = ref('')
const mysqlVersion = ref('')
const startTime = ref('')

// 计算属性
const hasContainer = computed(() => !!containerId.value)
const isRunning = computed(() => mysqlStatus.value === 'running')

const statusTitle = computed(() => {
  if (!hasContainer.value) return '未安装'
  if (mysqlStatus.value === 'running') return '运行中'
  if (mysqlStatus.value === 'restarting') return '重启中'
  return '已停止'
})

const statusBadgeText = computed(() => {
  if (!hasContainer.value) return 'Inactive'
  if (mysqlStatus.value === 'running') return 'Active'
  if (mysqlStatus.value === 'restarting') return 'Restarting'
  return 'Inactive'
})

const statusText = computed(() => {
  if (!hasContainer.value) return 'MySQL 服务未安装或未找到容器'
  if (mysqlStatus.value === 'running') return `MySQL 正在运行${mysqlVersion.value ? ' (版本: ' + mysqlVersion.value + ')' : ''}`
  if (mysqlStatus.value === 'restarting') return 'MySQL 正在尝试重启...'
  return 'MySQL 服务已停止'
})

const statusIconComponent = computed(() => {
  if (!hasContainer.value) return QuestionFilled
  if (mysqlStatus.value === 'running') return CircleCheck
  if (mysqlStatus.value === 'restarting') return Loading
  return CircleClose
})

const statusType = computed(() => {
  if (!hasContainer.value) return 'info'
  if (mysqlStatus.value === 'running') return 'success'
  if (mysqlStatus.value === 'restarting') return 'warning'
  return 'danger'
})

// 监听visible变化
watch(
  () => props.visible,
  (v) => {
    if (v && props.nodeId) {
      fetchStatus()
    }
  },
)

// 关闭弹窗
const handleClose = () => {
  visible.value = false
}

// 获取MySQL状态 (参考旧版本 MySqlStatusCard.vue)
const fetchStatus = async () => {
  if (!props.nodeId) return

  try {
    loading.value = true
    const res = await fetch(`/api/forward/${props.nodeId}/docker/containers/mysql8`)
    if (!res.ok) {
      resetStatus()
      return
    }
    const json = await res.json()
    const data = json && json.data ? json.data : null
    if (!data) {
      resetStatus()
      return
    }
    containerId.value = String(data.containerId || '')
    mysqlStatus.value = data.running ? 'running' : 'stopped'

    if (data.image) {
      const versionMatch = data.image.match(/mysql:(.+)/)
      mysqlVersion.value = versionMatch ? versionMatch[1] : data.image
    } else {
      mysqlVersion.value = ''
    }

    if (data.started) {
      try {
        const t = new Date(data.started)
        startTime.value = t.toLocaleString('zh-CN')
      } catch {
        startTime.value = ''
      }
    } else {
      startTime.value = ''
    }
  } catch {
    resetStatus()
    ElMessage.error('获取 MySQL 状态失败')
  } finally {
    loading.value = false
  }
}

const resetStatus = () => {
  mysqlStatus.value = 'stopped'
  startTime.value = ''
  containerId.value = ''
  mysqlVersion.value = ''
}

// 启动 MySQL
const handleStart = async () => {
  if (!props.nodeId || !containerId.value) return

  try {
    loading.value = true
    const res = await fetch(`/api/forward/${props.nodeId}/docker/containers/${containerId.value}/start`, { method: 'POST' })
    if (res.ok) {
      ElMessage.success('MySQL 服务启动成功')
      await fetchStatus()
      emit('refresh')
    } else {
      throw new Error('启动失败')
    }
  } catch {
    ElMessage.error('MySQL 服务启动失败')
  } finally {
    loading.value = false
  }
}

// 停止 MySQL
const handleStop = async () => {
  if (!props.nodeId || !containerId.value) return

  try {
    await ElMessageBox.confirm(
      '确定要停止 MySQL 服务吗？停止后所有连接将会断开。',
      '操作确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    loading.value = true
    const res = await fetch(`/api/forward/${props.nodeId}/docker/containers/${containerId.value}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: 10 })
    })
    if (res.ok) {
      ElMessage.success('MySQL 服务停止成功')
      await fetchStatus()
      emit('refresh')
    } else {
      throw new Error('停止失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('MySQL 服务停止失败')
    }
  } finally {
    loading.value = false
  }
}

// 重启 MySQL
const handleRestart = async () => {
  if (!props.nodeId || !containerId.value) return

  try {
    await ElMessageBox.confirm(
      '确定要重启 MySQL 服务吗？重启过程中服务将暂时不可用。',
      '操作确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    loading.value = true
    mysqlStatus.value = 'restarting'

    // 先停止
    try {
      await fetch(`/api/forward/${props.nodeId}/docker/containers/${containerId.value}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 10 })
      })
    } catch (e) {
      console.error('Stop failed during restart', e)
    }

    // 再启动
    const startRes = await fetch(`/api/forward/${props.nodeId}/docker/containers/${containerId.value}/start`, { method: 'POST' })
    if (startRes.ok) {
      ElMessage.success('MySQL 服务重启成功')
    } else {
      ElMessage.error('MySQL 服务启动失败')
    }

    await fetchStatus()
    emit('refresh')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('MySQL 服务重启失败')
      await fetchStatus()
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.status-display-area {
  margin-bottom: 24px;
}

.status-card {
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: var(--el-fill-color-blank);
}

.status-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.status-card.is-success {
  border-left: 4px solid var(--el-color-success);
}

.status-card.is-danger {
  border-left: 4px solid var(--el-color-danger);
}

.status-card.is-info {
  border-left: 4px solid var(--el-color-info);
}

.status-card.is-warning {
  border-left: 4px solid var(--el-color-warning);
}

.status-content {
  display: flex;
  align-items: center;
}

.status-icon-wrapper {
  width: 44px;
  height: 44px;
  background-color: var(--el-fill-color-light);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  flex-shrink: 0;
}

.text-success { color: var(--el-color-success); }
.text-danger { color: var(--el-color-danger); }
.text-info { color: var(--el-color-info); }
.text-warning { color: var(--el-color-warning); }

.status-info {
  flex: 1;
}

.status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.status-main-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.status-sub-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
}

.section-title::before {
  content: '';
  width: 4px;
  height: 14px;
  background-color: var(--el-color-primary);
  border-radius: 2px;
  margin-right: 8px;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  transition: all 0.3s ease;
}

:deep(.el-card__body) {
  padding: 16px 20px;
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
