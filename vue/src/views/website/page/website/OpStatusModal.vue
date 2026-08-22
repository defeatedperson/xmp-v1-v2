<template>
  <el-dialog
    v-model="visible"
    title="OpenResty 快捷操作"
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
                  {{ isRunning ? 'Active' : 'Inactive' }}
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
            :disabled="loading || isRunning"
            @click="startOpenResty"
            class="action-btn"
          >
            启动服务
          </el-button>

          <el-button
            type="danger"
            :icon="VideoPause"
            :disabled="loading || !isExists || !isRunning"
            @click="stopOpenResty"
            class="action-btn"
          >
            停止服务
          </el-button>

          <el-button
            type="primary"
            :icon="RefreshRight"
            :disabled="loading || !isExists"
            @click="reloadOpenResty"
            class="action-btn"
          >
            重载配置
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
import { ElMessage } from 'element-plus'
import {
  Refresh,
  VideoPlay,
  VideoPause,
  RefreshRight,
  CircleCheck,
  CircleClose,
  QuestionFilled
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
const statusData = ref({
  exists: false,
  running: false,
  status: '',
  containerId: ''
})

// 计算属性
const isExists = computed(() => statusData.value.exists)
const isRunning = computed(() => statusData.value.running)

const statusTitle = computed(() => {
  if (!statusData.value.exists) return '未安装'
  if (statusData.value.running) return '运行中'
  return '已停止'
})

const statusText = computed(() => {
  if (!statusData.value.exists) return 'OpenResty 服务未安装'
  if (statusData.value.running) return 'OpenResty 正在正常运行'
  return 'OpenResty 服务已停止'
})

const statusIconComponent = computed(() => {
  if (!statusData.value.exists) return QuestionFilled
  if (statusData.value.running) return CircleCheck
  return CircleClose
})

const statusType = computed(() => {
  if (!statusData.value.exists) return 'info'
  if (statusData.value.running) return 'success'
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

// 获取OpenResty状态
const fetchStatus = async () => {
  if (!props.nodeId) return

  try {
    loading.value = true
    const resp = await fetch(`/api/forward/${props.nodeId}/website/openresty/status`)
    const result = await resp.json()

    if (!resp.ok || !result.success) {
      throw new Error(result?.message || '获取状态失败')
    }

    statusData.value = result.data || {
      exists: false,
      running: false,
      status: '',
      containerId: ''
    }
  } catch (e) {
    ElMessage.error(e.message || '获取状态失败')
  } finally {
    loading.value = false
  }
}

// 统一操作函数
const performAction = async (action, successMsg) => {
  if (!props.nodeId) return

  try {
    loading.value = true
    const resp = await fetch(`/api/forward/${props.nodeId}/website/openresty/${action}`, {
      method: 'POST',
    })
    const result = await resp.json()

    if (!resp.ok || !result.success) {
      throw new Error(result?.message || '操作失败')
    }

    ElMessage.success(successMsg)
    await fetchStatus()
    emit('refresh') // 通知父组件刷新状态
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    loading.value = false
  }
}

const startOpenResty = () => performAction('start', 'OpenResty 启动成功')
const stopOpenResty = () => performAction('stop', 'OpenResty 停止成功')
const reloadOpenResty = () => performAction('reload', 'OpenResty 重载成功')
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
</style>
