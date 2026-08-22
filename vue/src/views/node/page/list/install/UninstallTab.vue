<template>
  <div class="uninstall-tab">
    <div class="node-info">
      <div class="info-content">
        <div class="info-row">
          <span class="info-label">节点类型：</span>
          <span class="info-value">{{ nodeTypeText }}</span>
        </div>
      </div>
    </div>

    <el-alert
      type="warning"
      title="卸载警告"
      :closable="false"
      show-icon
      style="margin-top: 0px"
    >
      <template #default>
        卸载将会删除程序文件、数据目录（证书、日志、数据库等），但会保留用户数据目录 (data/www)。
      </template>
    </el-alert>

    <el-form label-width="120px">
      <el-form-item label="静默卸载">
        <el-switch v-model="form.silent" />
        <span class="form-tip">开启后将直接执行，不进行二次确认</span>
      </el-form-item>
    </el-form>

    <div class="action-section">
      <el-button
        type="primary"
        plain
        @click="copyUninstallCommand"
      >
        复制卸载命令
      </el-button>
    </div>

    <div class="warning-section">
      <div class="warning-title">卸载后保留的内容：</div>
      <ul class="warning-list">
        <li>用户数据目录：data/www（网站文件等）</li>
        <li v-if="nodeType === 1">Docker（不会卸载）</li>
        <li v-if="nodeType === 1">正在运行的容器（不会停止）</li>
        <li v-if="nodeType !== 1">此节点类型不涉及 Docker</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  node: { type: Object, default: () => ({}) },
  modelValue: { type: Boolean, default: false }
})

const nodeType = computed(() => parseInt(props.node?.type) || 1)

const nodeTypeText = computed(() => {
  switch (nodeType.value) {
    case 1: return '通用被控'
    case 2: return '仅监控'
    case 3: return 'xcc套件'
    default: return '未知类型'
  }
})

const uninstallScriptUrl = computed(() => {
  switch (nodeType.value) {
    case 2: return 'https://dl.xmpanel.cn/sh2/monitor/uninstall.sh'
    case 3: return 'https://dl.xmpanel.cn/sh2/xcc/uninstall.sh'
    default: return 'https://dl.xmpanel.cn/sh2/uninstall.sh'
  }
})

const uninstallCommand = computed(() => `bash <(curl -sSL ${uninstallScriptUrl.value})`)

const form = reactive({
  silent: false
})

watch(() => props.modelValue, (val) => {
  if (val) {
    form.silent = false
  }
})

const buildCommand = () => {
  if (form.silent) {
    return `SILENT=y ${uninstallCommand.value}`
  }
  return uninstallCommand.value
}

const copyToClipboard = async (text, successMsg = '复制成功') => {
  if (!text) {
    ElMessage.warning('内容为空')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(successMsg)
  } catch {
    ElMessage.error('复制失败')
  }
}

const copyUninstallCommand = () => {
  const cmd = buildCommand()
  copyToClipboard(cmd, '卸载命令已复制')
}
</script>

<style scoped>
.uninstall-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.node-info {
  padding: 12px 16px;
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
}

.info-content {
  font-size: 14px;
}

.info-row {
  display: flex;
  align-items: center;
}

.info-label {
  font-weight: 500;
}

.info-value {
  color: var(--el-color-primary);
  font-weight: 500;
}

.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.action-section {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.warning-section {
  padding: 16px;
  background: var(--el-color-info-light-9);
  border-radius: 8px;
}

.warning-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.warning-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.warning-list li {
  margin-bottom: 4px;
}
</style>
