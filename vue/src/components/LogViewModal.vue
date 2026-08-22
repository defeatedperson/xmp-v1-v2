<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="400px"
    destroy-on-close
    class="log-view-dialog"
    @update:model-value="$emit('update:visible', $event)"
    @close="$emit('close')"
  >
    <div v-loading="loading" class="log-container">
      <pre v-if="content" class="log-content">{{ content }}</pre>
      <el-empty v-else description="暂无日志内容" />
    </div>
  </el-dialog>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '日志详情'
  },
  content: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:visible', 'close'])
</script>

<style scoped>
.log-container {
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
  background-color: var(--el-bg-color-page);
  border-radius: 4px;
  padding: 12px;
}

.log-content {
  margin: 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>
