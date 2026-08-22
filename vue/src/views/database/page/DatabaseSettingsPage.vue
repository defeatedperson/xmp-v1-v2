<template>
  <div class="database-settings-page">
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          @error="handleNodeError"
          class="node-select-wrapper"
        />
      </div>
      <div class="header-right">
        <el-button-group>
          <el-button
            :icon="Refresh"
            @click="handleRefresh"
            :disabled="!currentNodeId"
            :loading="loading"
          >
            刷新状态
          </el-button>
        </el-button-group>
      </div>
    </div>

    <div class="content-container">
      <el-tabs v-model="activeTab" class="settings-tabs">
        <el-tab-pane
          v-for="tab in tabs"
          :key="tab.key"
          :label="tab.label"
          :name="tab.key"
        >
          <div class="tab-content">
            <template v-if="currentNodeId">
              <template v-if="tab.key === 'service' && activeTab === 'service'">
                <MySqlServiceCard
                  :node-id="currentNodeId"
                  @refresh="handleRefresh"
                />
              </template>

              <template v-else-if="tab.key === 'root-password' && activeTab === 'root-password'">
                <div :class="{ 'overlay-disabled': isServiceLimited }">
                  <RootPasswordCard
                    :node-id="currentNodeId"
                  />
                  <div
                    v-if="isServiceLimited"
                    class="overlay-mask"
                  />
                </div>
              </template>

              <template v-else-if="tab.key === 'performance' && activeTab === 'performance'">
                <div :class="{ 'overlay-disabled': isServiceLimited }">
                  <PerformanceTuningCard
                    :node-id="currentNodeId"
                    :service-status="serviceStatus"
                  />
                  <div
                    v-if="isServiceLimited"
                    class="overlay-mask"
                  />
                </div>
              </template>

              <template v-else-if="tab.key === 'logs' && activeTab === 'logs'">
                <div :class="{ 'overlay-disabled': isServiceLimited }">
                  <LogViewerCard
                    :node-id="currentNodeId"
                    :max-logs="500"
                  />
                  <div
                    v-if="isServiceLimited"
                    class="overlay-mask"
                  />
                </div>
              </template>
            </template>
            <el-empty
              v-else
              description="请先选择节点"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import PerformanceTuningCard from './setting/PerformanceTuningCard.vue'
import LogViewerCard from './setting/LogViewerCard.vue'
import MySqlServiceCard from './setting/MySqlServiceCard.vue'
import RootPasswordCard from './setting/RootPasswordCard.vue'

const currentNodeId = ref('')
const activeTab = ref('service')
const serviceStatus = ref('')
const loading = ref(false)

const tabs = [
  { key: 'service', label: '服务状态' },
  { key: 'root-password', label: 'Root密码' },
  { key: 'performance', label: '性能调整' },
  { key: 'logs', label: '运行日志' }
]

const isServiceLimited = computed(() => {
  if (!serviceStatus.value) return false
  if (serviceStatus.value === '正常') return false
  if (serviceStatus.value === '不存在') return true
  return true
})

const handleNodeSelected = (node) => {
  const id = node && node.id ? String(node.id) : ''
  if (currentNodeId.value === id) return
  currentNodeId.value = id
  if (!currentNodeId.value) {
    serviceStatus.value = ''
    return
  }
  loadStatus()
}

const handleNodeError = () => {
  currentNodeId.value = ''
  serviceStatus.value = ''
}

const loadStatus = async () => {
  if (!currentNodeId.value) return
  loading.value = true
  try {
    const response = await fetch(`/api/forward/${currentNodeId.value}/mysql/admin/status`)
    if (!response.ok && response.status === 502) {
      serviceStatus.value = '连接失败'
      return
    }
    const result = await response.json().catch(() => ({}))
    if (result && result.success) {
      serviceStatus.value = result.data?.status || '未知'
    } else {
      const msg = String(result?.message || result?.error || '')
      if (msg.includes('ECONNREFUSED')) {
        serviceStatus.value = '连接失败'
      } else {
        serviceStatus.value = '异常'
      }
    }
  } catch {
    serviceStatus.value = '连接失败'
  } finally {
    loading.value = false
  }
}

const handleRefresh = async () => {
  if (!currentNodeId.value) {
    ElMessage.warning('请先选择节点')
    return
  }
  await loadStatus()
  ElMessage.success('状态已更新')
}
</script>

<style scoped>
.database-settings-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-bg-color-overlay);
  padding: 10px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.node-select-wrapper {
  width: 220px;
}

.content-container {
  background: var(--el-bg-color-overlay);
  padding: 10px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  min-height: 400px;
}

.tab-content {
  margin-top: 0px;
}

.overlay-disabled {
  position: relative;
  pointer-events: none;
}

.overlay-mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
}

@media (max-width: 1000px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .header-left {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
