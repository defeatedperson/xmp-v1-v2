<template>
  <el-dialog
    v-model="visible"
    title="节点管理"
    width="730px"
    :before-close="handleClose"
  >
    <div class="install-modal">
      <el-tabs v-model="installType" class="type-tabs">
        <el-tab-pane label="安装" name="install" />
        <el-tab-pane label="更新" name="update" />
        <el-tab-pane label="卸载" name="uninstall" />
      </el-tabs>

      <div class="tab-content">
        <InstallTab
          v-if="installType === 'install'"
          ref="installRef"
          v-model="visible"
          :node="node"
        />
        <UpdateTab
          v-if="installType === 'update'"
          ref="updateRef"
          v-model="visible"
          :node="node"
        />
        <UninstallTab
          v-if="installType === 'uninstall'"
          ref="uninstallRef"
          v-model="visible"
          :node="node"
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import InstallTab from './install/InstallTab.vue'
import UpdateTab from './install/UpdateTab.vue'
import UninstallTab from './install/UninstallTab.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  node: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const installType = ref('install')

const installRef = ref(null)
const updateRef = ref(null)
const uninstallRef = ref(null)

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    installType.value = 'install'
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const handleClose = () => {
  visible.value = false
}
</script>

<style scoped>
.install-modal {
  display: flex;
  flex-direction: column;
}

.type-tabs {
  margin-bottom: 16px;
}

.type-tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom: 2px solid var(--el-border-color-lighter);
}

.type-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.type-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  height: 40px;
  line-height: 40px;
}

.type-tabs :deep(.el-tabs__active-bar) {
  height: 2px;
  border-radius: 2px;
}

.tab-content {
  min-height: 300px;
}
</style>
