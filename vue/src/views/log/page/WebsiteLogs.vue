<template>
  <div class="website-logs-page">
    <div class="page-header">
      <div class="filter-group">
        <NodeSelector :node-type="1" @node-selected="handleNodeSelected" />
        <el-select
          v-model="selectedSiteId"
          placeholder="请选择站点"
          :disabled="!selectedNodeId || loadingSites"
          filterable
          style="width: 220px"
          @change="handleSiteChange"
        >
          <el-option
            v-for="site in sites"
            :key="site.id"
            :label="site.name || site.id"
            :value="site.id"
          />
        </el-select>
      </div>
      <div class="header-right">
        <el-button :icon="Refresh" circle @click="loadSites" :disabled="!selectedNodeId" title="刷新站点列表" />
      </div>
    </div>

    <div class="content-wrapper" v-loading="loadingSites">
      <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4" />

      <div v-if="selectedSiteId && selectedSite" class="settings-container">
        <SiteLogSettings
          :site="selectedSite"
          :nodeId="selectedNodeId"
          @refresh="loadSites"
        />
      </div>
      <div v-else class="empty-state">
        <el-empty description="请选择站点以查看日志配置" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import SiteLogSettings from '@/views/website/page/setting/SiteLogSettings.vue'

const selectedNodeId = ref('')
const selectedSiteId = ref('')
const sites = ref([])
const loadingSites = ref(false)
const error = ref('')

const selectedSite = computed(() => {
  if (!selectedSiteId.value) return null
  return sites.value.find(s => s.id === selectedSiteId.value) || null
})

const handleNodeSelected = (node) => {
  selectedNodeId.value = node && node.id ? String(node.id) : ''
  selectedSiteId.value = ''
  sites.value = []
  error.value = ''

  if (selectedNodeId.value) {
    loadSites()
  }
}

const loadSites = async () => {
  if (!selectedNodeId.value) return

  loadingSites.value = true
  error.value = ''

  try {
    const resp = await fetch(`/api/forward/${selectedNodeId.value}/sites`)
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

    sites.value = Array.isArray(result.data) ? result.data : []

    // 如果有站点且当前未选择，默认选择第一个
    if (sites.value.length > 0 && !selectedSiteId.value) {
      selectedSiteId.value = sites.value[0].id
    } else if (selectedSiteId.value && !sites.value.find(s => s.id === selectedSiteId.value)) {
      // 如果当前选择的站点不在列表中，清空选择
      selectedSiteId.value = ''
    }
  } catch (e) {
    console.error('获取站点列表失败:', e)
    error.value = e.message || '获取站点列表失败'
    sites.value = []
  } finally {
    loadingSites.value = false
  }
}

const handleSiteChange = () => {
  error.value = ''
}
</script>

<style scoped>
.website-logs-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 0px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.content-wrapper {
  flex: 1;
  min-height: 0;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.mb-4 {
  margin-bottom: 16px;
}
</style>
