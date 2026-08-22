<template>
  <el-dialog
    :model-value="visible"
    title="测试计划任务"
    width="480px"
    @close="handleClose"
    destroy-on-close
  >
    <div class="test-content">
      <!-- 当前时间槽信息 -->
      <div class="info-card">
        <div class="info-label">当前时间槽</div>
        <div class="slot-time">{{ slotLabel }}</div>
      </div>

      <!-- 操作指引 -->
      <el-steps direction="vertical" :active="3" finish-status="process">
        <el-step title="准备" description="将要测试的任务拖拽到当前时间槽" />
        <el-step title="保存" description="点击页面右上角的“保存计划”按钮" />
        <el-step title="触发" description="点击下方按钮立即执行测试" />
      </el-steps>

      <el-alert
        title="测试将立即执行当前时间槽的所有任务，请谨慎操作。"
        type="warning"
        show-icon
        :closable="false"
        style="margin-top: 20px"
      />
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleTestClick" :loading="testing">
          <el-icon class="el-icon--left"><VideoPlay /></el-icon>
          开始测试
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoPlay } from '@element-plus/icons-vue'

const props = defineProps({
  visible: Boolean,
  slotLabel: String,
  nodeId: [String, Number]
})

const emit = defineEmits(['update:visible', 'close'])
const testing = ref(false)

const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

const handleTestClick = async () => {
  if (!props.nodeId) {
    ElMessage.warning('请选择节点')
    return
  }

  try {
    await ElMessageBox.confirm(
      '确定立即执行当前时间槽的计划任务吗？',
      '测试确认',
      {
        confirmButtonText: '开始测试',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    testing.value = true
    const res = await fetch(`/api/forward/${props.nodeId}/schedule/run`, {
      method: 'POST'
    })
    const json = await res.json()
    
    if (json.success) {
      ElMessage.success(json.message || '测试任务已触发')
      handleClose()
    } else {
      throw new Error(json.message || '触发失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '操作失败')
    }
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.test-content {
  padding: 0 10px;
}

.info-card {
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-bottom: 24px;
}

.info-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
}

.slot-time {
  font-size: 24px;
  font-weight: bold;
  color: var(--el-color-primary);
  font-family: monospace;
}

:deep(.el-step__title) {
  font-size: 14px;
}
:deep(.el-step__description) {
  font-size: 12px;
}
</style>
