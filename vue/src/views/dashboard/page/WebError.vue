<template>
  <div class="web-error-page">
    <!-- 过滤器区域 -->
    <div class="filter-header">
      <div class="filter-left">
        <el-select
          v-model="selectedDomain"
          placeholder="请选择站点"
          class="filter-item site-select"
          :loading="loading && !siteOptions.length"
          :disabled="!currentNodeId || loading || siteOptions.length === 0"
        >
          <el-option
            v-for="site in siteOptions"
            :key="site.id"
            :label="site.name"
            :value="site.id"
          />
        </el-select>

        <el-button
          type="primary"
          class="refresh-btn"
          @click="analyzeErrorLogs"
          :loading="loading"
          :disabled="!selectedDomain || loading"
        >
          <i class="fas fa-sync-alt" v-if="!loading"></i>
        </el-button>
      </div>

      <div class="filter-right">
        <NodeSelector
          :node-type="1"
          class="filter-item"
          @node-selected="handleNodeSelected"
          @error="handleNodeError"
        />
      </div>
    </div>

    <!-- 数据展示区域 -->
    <div v-if="error" class="error-container">
      <el-alert :title="error" type="error" :closable="false" show-icon />
    </div>

    <div v-if="!selectedDomain" class="empty-container">
      <el-empty description="请选择节点和站点以开始分析错误日志">
        <template #image>
          <i class="fas fa-bug" style="font-size: 48px; color: var(--el-text-color-placeholder)"></i>
        </template>
      </el-empty>
    </div>

    <div v-else v-loading="loading" class="content-container">
      <!-- 统计卡片 -->
      <ErrorStatsCards :stats="statsData" class="stats-section" />

      <!-- 图表区域 -->
      <div class="charts-section">
        <el-row :gutter="10">
          <!-- 错误时间分布 -->
          <el-col :md="18" :sm="24" class="chart-col">
            <ResourceLineChart
              title="错误时间分布"
              :chart-data="errorTrendData"
              height="400px"
            />
          </el-col>

          <!-- 错误级别占比 -->
          <el-col :md="6" :sm="24" class="chart-col">
            <ErrorLevelPie
              title="错误级别占比"
              :chart-data="levelPieData"
              :loading="loading"
              height="400px"
            />
          </el-col>

          <!-- Top 列表 -->
          <el-col :md="8" :sm="24" class="chart-col">
            <ErrorTopList
              title="Top 报错信息"
              :items="topMessages"
              height="450px"
            />
          </el-col>
          <el-col :md="8" :sm="24" class="chart-col">
            <ErrorTopList
              title="Top 来源 IP"
              :items="topIps"
              height="450px"
            />
          </el-col>
          <el-col :md="8" :sm="24" class="chart-col">
            <ErrorTopList
              title="Top 受影响路径"
              :items="topPaths"
              height="450px"
            />
          </el-col>
        </el-row>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import NodeSelector from '@/components/NodeSelector.vue'
import ResourceLineChart from '@/components/ResourceLineChart.vue'
import ErrorStatsCards from './weberror/ErrorStatsCards.vue'
import ErrorLevelPie from './weberror/ErrorLevelPie.vue'
import ErrorTopList from './weberror/ErrorTopList.vue'

// 状态变量
const currentNodeId = ref('')
const sites = ref([])
const siteOptions = ref([])
const selectedDomain = ref('')
const loading = ref(false)
const error = ref('')

// 数据源
const statsData = ref({
  totalErrors: 0,
  lines: 0,
  domain: '-',
  durationMs: 0
})

const errorTrendData = ref({
  labels: [],
  datasets: [
    {
      label: '错误数',
      data: [],
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      fill: true,
      tension: 0.4,
    },
  ],
})

const levelPieData = ref({
  labels: [],
  datasets: [
    {
      data: [],
      backgroundColor: ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#6366f1'],
      borderColor: 'transparent',
      borderWidth: 0,
    },
  ],
})

const topMessages = ref([])
const topIps = ref([])
const topPaths = ref([])

// 计算属性
const selectedSite = computed(() => {
  if (!selectedDomain.value) return null
  return sites.value.find((item) => String(item.id) === String(selectedDomain.value)) || null
})

const getCurrentDomain = () => {
  if (!selectedSite.value) return ''
  return selectedSite.value.primaryDomain || selectedSite.value.id
}


const resetData = () => {
  statsData.value = {
    totalErrors: 0,
    lines: 0,
    domain: '-',
    durationMs: 0
  }
  errorTrendData.value.labels = []
  errorTrendData.value.datasets[0].data = []
  levelPieData.value.labels = []
  levelPieData.value.datasets[0].data = []
  topMessages.value = []
  topIps.value = []
  topPaths.value = []
}

// 数据加载
const loadSites = async () => {
  if (!currentNodeId.value) return
  loading.value = true
  error.value = ''
  try {
    const resp = await fetch(`/api/forward/${currentNodeId.value}/sites`)
    const result = await resp.json()
    if (!resp.ok || !result.success) throw new Error(result.message || '获取站点列表失败')

    sites.value = result.data || []
    siteOptions.value = sites.value.map(s => ({ id: s.id, name: s.name || s.id }))
    if (siteOptions.value.length) {
      selectedDomain.value = siteOptions.value[0].id
    } else {
      selectedDomain.value = ''
    }
  } catch (e) {
    error.value = e.message
    sites.value = []
    siteOptions.value = []
    selectedDomain.value = ''
  } finally {
    loading.value = false
  }
}

const analyzeErrorLogs = async () => {
  const domain = getCurrentDomain()
  if (!currentNodeId.value || !domain) return

  loading.value = true
  error.value = ''

  try {
    const url = `/api/forward/${currentNodeId.value}/sites/${encodeURIComponent(domain)}/logs/analyze?type=error`
    const resp = await fetch(url)
    const result = await resp.json()

    if (!resp.ok || !result.success) throw new Error(result.message || '分析错误日志失败')

    updateDashboard(result.data || {})
  } catch (e) {
    error.value = e.message
    resetData()
  } finally {
    loading.value = false
  }
}

const updateDashboard = (data) => {
  if (!data || !data.summary) {
    resetData()
    return
  }

  const summary = data.summary

  // 更新统计卡片
  statsData.value = {
    totalErrors: Number(summary.totalErrors || 0),
    lines: Number(summary.lines || 0),
    domain: data.domain || '-',
    durationMs: Number(data.durationMs || 0)
  }

  // 更新趋势图
  const buckets = Array.isArray(summary.timeBuckets) ? summary.timeBuckets : []
  errorTrendData.value.labels = buckets.map(b => b.time || '')
  errorTrendData.value.datasets[0].data = buckets.map(b => Number(b.total || 0))

  // 更新饼图
  const levelCounts = summary.levelCounts || {}
  levelPieData.value.labels = Object.keys(levelCounts)
  levelPieData.value.datasets[0].data = Object.values(levelCounts)

  // 更新 Top 列表
  topMessages.value = Array.isArray(summary.topMessages) ? summary.topMessages : []
  topIps.value = Array.isArray(summary.topIps) ? summary.topIps : []
  topPaths.value = Array.isArray(summary.topPaths) ? summary.topPaths : []
}

// 事件处理
const handleNodeSelected = (node) => {
  currentNodeId.value = node?.id ? String(node.id) : ''
  resetData()
  if (currentNodeId.value) {
    loadSites()
  }
}

const handleNodeError = (msg) => {
  error.value = msg
  currentNodeId.value = ''
  resetData()
}

// 监听
watch(selectedDomain, (newVal) => {
  if (newVal) {
    analyzeErrorLogs()
  } else {
    resetData()
  }
})
</script>

<style scoped>
.web-error-page {
  min-height: 100%;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  background: var(--el-bg-color-overlay);
  padding: 16px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.filter-left, .filter-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-item {
  min-width: 180px;
}

.site-select {
  width: 240px;
}

.refresh-btn {
  width: 40px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-container {
  margin-bottom: 210px;
}

.empty-container {
  margin-top: 100px;
}

.content-container {
  animation: fadeIn 0.4s ease-out;
}

.chart-col {
  margin-bottom: 10px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1000px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .filter-left, .filter-right {
    width: 100%;
    justify-content: space-between;
  }

  .site-select {
    flex: 1;
  }
}
</style>
