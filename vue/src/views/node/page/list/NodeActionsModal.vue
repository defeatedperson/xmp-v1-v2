<template>
  <el-dialog
    v-model="visible"
    title="节点操作"
    width="320px"
    :before-close="handleClose"
  >
    <div class="actions-list" v-loading="isLoading">
      <div class="action-item" @click="checkWebPerm" :class="{ disabled: isLoading }">
        <el-icon><Unlock /></el-icon>
        <span>权限修复</span>
      </div>

      <div class="action-item" @click="restartDaemon" :class="{ disabled: isLoading }">
        <el-icon><Refresh /></el-icon>
        <span>重启被控</span>
      </div>

      <div class="action-item" @click="restartDockerEngine" :class="{ disabled: isLoading }">
        <el-icon><SwitchButton /></el-icon>
        <span>重启Docker</span>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessageBox, ElNotification } from 'element-plus'
import { Unlock, Refresh, SwitchButton } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const isLoading = ref(false)

watch(() => props.modelValue, (val) => {
  visible.value = val
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const handleClose = () => {
  if (isLoading.value) return
  visible.value = false
}

const checkWebPerm = async () => {
  if (isLoading.value) return

  try {
    await ElMessageBox.confirm('确定要修复该节点的目录权限吗？', '权限修复确认', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })

    isLoading.value = true
    const response = await fetch(`/api/forward/${props.nodeId}/daemon/check-web-perm`, { method: 'POST' })
    const data = await response.json()

    if (data.success) {
      ElNotification.success(data.message || '目录权限修复请求已提交')
      handleClose()
    } else {
      ElNotification.error(data.message || '权限修复请求提交失败')
    }
  } catch (err) {
    if (err !== 'cancel') ElNotification.error('网络错误，请稍后重试')
  } finally {
    isLoading.value = false
  }
}

const restartDaemon = async () => {
  if (isLoading.value) return

  try {
    await ElMessageBox.confirm('确定要重启该节点的被控服务吗？', '重启被控确认', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })

    isLoading.value = true
    const response = await fetch(`/api/forward/${props.nodeId}/daemon/restart-self`, { method: 'POST' })
    const data = await response.json()

    if (data.success) {
      ElNotification.success(data.message || '重启请求已提交')
      handleClose()
    } else {
      ElNotification.error(data.message || '重启请求提交失败')
    }
  } catch (err) {
    if (err !== 'cancel') ElNotification.error('网络错误，请稍后重试')
  } finally {
    isLoading.value = false
  }
}

const restartDockerEngine = async () => {
  if (isLoading.value) return

  try {
    await ElMessageBox.confirm('确定要重启该节点的Docker引擎吗？', '重启Docker确认', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })

    isLoading.value = true
    const response = await fetch(`/api/forward/${props.nodeId}/docker/engine/restart`, { method: 'POST' })
    const data = await response.json()

    if (data.success) {
      ElNotification.success(data.message || 'Docker引擎重启请求已提交')
      handleClose()
    } else {
      ElNotification.error(data.message || 'Docker引擎重启请求提交失败')
    }
  } catch (err) {
    if (err !== 'cancel') ElNotification.error('网络错误，请稍后重试')
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  cursor: pointer;
  transition: all 0.2s;
}

.action-item:hover:not(.disabled) {
  background: var(--el-color-primary-light-9);
}

.action-item.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
