<template>
  <div class="php-env-settings" v-if="containerName">
    <div class="settings-header">
      <div class="header-main">
        <div class="settings-title">
          <span class="title-main">环境设置</span>
          <el-tag size="small" type="info" effect="plain" class="ml-2">{{ containerName }}</el-tag>
        </div>
        <div class="header-actions">
          <el-button-group>
            <el-button
              v-for="tab in tabs"
              :key="tab.key"
              :type="activeTab === tab.key ? 'primary' : ''"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </el-button>
          </el-button-group>
        </div>
      </div>
    </div>

    <div class="settings-content">
      <div class="tab-content-wrapper">
        <component
          :is="getComponent(activeTab)"
          :node-id="nodeId"
          :container-name="containerName"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, markRaw } from 'vue'
import PhpGeneralSettings from './child/PhpGeneralSettings.vue'
import PhpDisableFunctionsSettings from './child/PhpDisableFunctionsSettings.vue'
import PhpFpmSettings from './child/PhpFpmSettings.vue'
import PhpSoExtensionsManager from './child/PhpSoExtensionsManager.vue'
import PhpActiveExtensions from './child/PhpActiveExtensions.vue'
import PhpExtensionsSettings from './child/PhpExtensionsSettings.vue'

const props = defineProps({
  nodeId: { type: String, default: '' },
  containerName: { type: String, default: '' },
})

const tabs = [
  { key: 'active', label: '已启用扩展' },
  { key: 'extensions', label: '扩展设置' },
  { key: 'php-settings', label: '常规设置' },
  { key: 'php-disabled', label: '禁用函数' },
  { key: 'fpm-settings', label: 'FPM设置' },
  { key: 'so-extensions', label: '自定义.so扩展' },
]

const activeTab = ref('active')

// 映射组件，使用 markRaw 避免不必要的响应式开销
const componentMap = {
  'active': markRaw(PhpActiveExtensions),
  'extensions': markRaw(PhpExtensionsSettings),
  'php-settings': markRaw(PhpGeneralSettings),
  'php-disabled': markRaw(PhpDisableFunctionsSettings),
  'fpm-settings': markRaw(PhpFpmSettings),
  'so-extensions': markRaw(PhpSoExtensionsManager),
}

const getComponent = (key) => componentMap[key]

watch(
  () => [props.nodeId, props.containerName],
  ([nodeId, containerName]) => {
    if (!nodeId || !containerName) {
      return
    }
    activeTab.value = 'active'
  },
  { immediate: true },
)
</script>

<style scoped>
.php-env-settings {
  padding: 20px;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  min-height: 500px;
  display: flex;
  flex-direction: column;
}

.settings-header {
  margin-bottom: 0px;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.settings-title {
  display: flex;
  align-items: center;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.title-main {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ml-2 {
  margin-left: 8px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
}

.tab-content-wrapper {
  padding: 10px 0;
}
</style>
