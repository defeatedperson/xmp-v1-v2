<template>
  <div class="site-settings-page">
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
        <div class="filter-group">
          <el-select
            v-model="selectedDomainId"
            placeholder="请选择站点"
            :disabled="!currentNodeId || loading || siteOptions.length === 0"
            class="site-select"
            filterable
          >
            <template #prefix>
              <el-icon v-if="loading"><Loading /></el-icon>
              <el-icon v-else><Search /></el-icon>
            </template>
            <el-option
              v-for="site in siteOptions"
              :key="site.id"
              :label="site.name"
              :value="site.id"
            />
          </el-select>
        </div>
      </div>
    </div>

    <div class="content-container">
      <el-tabs v-model="activeTab" class="settings-tabs">
        <el-tab-pane v-for="tab in tabs" :key="tab.key" :label="tab.label" :name="tab.key">
          <div v-if="error && activeTab === tab.key" class="error-container">
            <el-alert :title="error" type="error" :closable="false" show-icon />
          </div>

          <div v-loading="loading" class="tab-content" element-loading-background="rgba(0, 0, 0, 0.7)">
            <component
              :is="getComponent(tab.key)"
              v-if="activeTab === tab.key && selectedSite"
              :site="selectedSite"
              :nodeId="currentNodeId"
              @refresh="loadSites"
            />
            <el-empty v-else-if="!loading && !selectedSite" description="请先选择站点" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, markRaw } from 'vue'
import { Loading, Search } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import SiteBasicInfo from './setting/SiteBasicInfo.vue'
import SiteListenSettings from './setting/SiteListenSettings.vue'
import SiteDomainsSettings from './setting/SiteDomainsSettings.vue'
import SiteTypeSettings from './setting/SiteTypeSettings.vue'
import SiteRuleSettings from './setting/SiteRuleSettings.vue'
import SiteCustomRuleSettings from './setting/SiteCustomRuleSettings.vue'
import SiteLogSettings from './setting/SiteLogSettings.vue'

const props = defineProps({
  initialDomain: {
    type: String,
    default: '',
  },
})

const currentNodeId = ref('')
const sites = ref([])
const siteOptions = ref([])
const selectedDomainId = ref('')
const loading = ref(false)
const error = ref('')
const activeTab = ref('basic')

const tabs = [
  { key: 'basic', label: '基础信息' },
  { key: 'listen', label: '协议与监听' },
  { key: 'domains', label: '域名与别名' },
  { key: 'type', label: '类型与环境' },
  { key: 'rule', label: '站点规则' },
  { key: 'advancedRule', label: '高级规则' },
  { key: 'logs', label: '日志设置' },
]

const componentMap = {
  basic: markRaw(SiteBasicInfo),
  listen: markRaw(SiteListenSettings),
  domains: markRaw(SiteDomainsSettings),
  type: markRaw(SiteTypeSettings),
  rule: markRaw(SiteRuleSettings),
  advancedRule: markRaw(SiteCustomRuleSettings),
  logs: markRaw(SiteLogSettings),
}

const getComponent = (key) => componentMap[key]

const selectedSite = computed(() => {
  if (!selectedDomainId.value) return null
  return sites.value.find((item) => String(item.id) === String(selectedDomainId.value)) || null
})

const STORAGE_KEY = 'last_selected_site_id'

const applySelectedDomain = () => {
  const initial = (props.initialDomain || '').trim()
  const storedId = localStorage.getItem(STORAGE_KEY)

  if (!siteOptions.value.length) {
    selectedDomainId.value = ''
    return
  }

  // 1. 优先尝试 props 传入的初始域名
  if (initial) {
    const exists = siteOptions.value.find((s) => String(s.id) === initial)
    if (exists) {
      selectedDomainId.value = exists.id
      error.value = ''
      return
    } else {
      error.value = `找不到主域名为 ${initial} 的站点`
      // 如果 props 找不到，继续往下走记忆逻辑，而不是直接报错返回
    }
  }

  // 2. 尝试记忆的站点
  if (storedId) {
    const exists = siteOptions.value.find((s) => String(s.id) === String(storedId))
    if (exists) {
      selectedDomainId.value = exists.id
      error.value = ''
      return
    }
  }

  // 3. 兜底逻辑：如果当前已选的仍然有效则保留，否则选第一个
  const currentExists = siteOptions.value.find(s => String(s.id) === String(selectedDomainId.value))
  if (!selectedDomainId.value || !currentExists) {
    selectedDomainId.value = siteOptions.value[0].id || ''
  }
  error.value = ''
}

const loadSites = async () => {
  if (!currentNodeId.value) return
  loading.value = true
  error.value = ''
  try {
    const resp = await fetch(`/api/forward/${currentNodeId.value}/sites`)
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok) {
      const msg = result && result.message ? result.message : `HTTP ${resp.status}`
      throw new Error(msg)
    }
    if (!result || !result.success) {
      const msg = result && result.message ? result.message : '获取站点列表失败'
      throw new Error(msg)
    }
    const list = Array.isArray(result.data) ? result.data : []
    sites.value = list
    siteOptions.value = list.map((item) => ({
      id: item.id,
      name: item.name || item.id,
    }))
    applySelectedDomain()
  } catch (e) {
    error.value = e.message || '获取站点列表失败'
    siteOptions.value = []
  } finally {
    loading.value = false
  }
}

const handleNodeSelected = (node) => {
  const newNodeId = node && node.id ? String(node.id) : ''
  if (currentNodeId.value === newNodeId) return

  currentNodeId.value = newNodeId
  siteOptions.value = []
  selectedDomainId.value = ''
  if (!currentNodeId.value) return
  loadSites()
}

const handleNodeError = (message) => {
  error.value = message || ''
  siteOptions.value = []
  selectedDomainId.value = ''
  currentNodeId.value = ''
}

watch(selectedDomainId, (newVal) => {
  if (newVal) {
    localStorage.setItem(STORAGE_KEY, newVal)
  }
})

watch(
  () => props.initialDomain,
  () => {
    if (siteOptions.value.length > 0) {
      applySelectedDomain()
    }
  },
)
</script>

<script>
export default {
  name: 'SiteSettingsPage'
}
</script>

<style scoped>
.site-settings-page {
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

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.node-select-wrapper {
  width: 220px;
}

.site-select {
  width: 240px;
}

.content-container {
  background: var(--el-bg-color-overlay);
  padding: 10px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  min-height: 400px;
}

.tab-content {
  margin-top: 16px;
}

.error-container {
  margin-bottom: 16px;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__header) {
  margin-bottom: 0;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .header-left, .header-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .site-select {
    flex: 1;
  }
}
</style>
