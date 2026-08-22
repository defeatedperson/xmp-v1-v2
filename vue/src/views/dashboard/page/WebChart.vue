<template>
  <div class="web-chart-page">
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

        <el-select
          v-model="selectedLogRange"
          placeholder="请选择时间范围"
          class="filter-item range-select"
          :disabled="!selectedSite || loading"
        >
          <el-option label="今日访问" value="today" />
          <el-option
            v-for="file in historyLogFiles"
            :key="file.name"
            :label="`${formatDate(file.name)} (${formatFileSize(file.size)})`"
            :value="file.name"
          />
        </el-select>
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

    <div v-loading="loading" class="content-container">
      <!-- 统计卡片 -->
      <WebStatsCards :stats="statsData" class="stats-section" />

      <!-- 图表区域 -->
      <div class="charts-section">
        <el-row :gutter="10">
          <!-- 访问量趋势 -->
          <el-col :span="24" class="chart-col">
            <ResourceLineChart
              title="访问量趋势"
              :chart-data="requestChartData"
              height="350px"
            />
          </el-col>

          <!-- 流量趋势 -->
          <el-col :span="24" class="chart-col">
            <ResourceLineChart
              title="流量趋势"
              :chart-data="trafficChartData"
              height="350px"
              :y-axis-formatter="formatBytes"
            />
          </el-col>

          <!-- 状态码趋势与分布 -->
          <el-col :md="18" :sm="24" class="chart-col">
            <ResourceLineChart
              title="状态码趋势"
              :chart-data="statusChartData"
              height="350px"
            />
          </el-col>
          <el-col :md="6" :sm="24" class="chart-col">
            <WebStatusPie
              title="状态码分布"
              :chart-data="statusPieChartData"
              :loading="loading"
              height="350px"
            />
          </el-col>

          <!-- 错误趋势 -->
          <el-col :span="24" class="chart-col">
            <ResourceLineChart
              title="错误趋势"
              :chart-data="errorChartData"
              height="350px"
            />
          </el-col>

          <!-- Top 列表 -->
          <el-col :md="12" :sm="24" class="chart-col">
            <WebTopList title="Top IP 排行" :items="topIps" :loading="loading" />
          </el-col>
          <el-col :md="12" :sm="24" class="chart-col">
            <WebTopList title="Top URL 排行" :items="topPaths" :loading="loading" />
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
import WebStatsCards from './webchart/WebStatsCards.vue'
import WebStatusPie from './webchart/WebStatusPie.vue'
import WebTopList from './webchart/WebTopList.vue'

// 状态变量
const currentNodeId = ref('')
const sites = ref([])
const siteOptions = ref([])
const selectedDomain = ref('')
const selectedLogRange = ref('today')
const loading = ref(false)
const error = ref('')
const historyLogFiles = ref([])

// 数据源
const statsData = ref({
  req: 0,
  ips: 0,
  traffic: '0 B',
  errors: 0
})

const requestChartData = ref({ labels: [], datasets: [{ label: '请求数', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4 }] })
const trafficChartData = ref({ labels: [], datasets: [{ label: '流量', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.1)', fill: true, tension: 0.4 }] })
const statusChartData = ref({
  labels: [],
  datasets: [
    { label: '2xx', data: [], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.4 },
    { label: '3xx', data: [], borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4 },
    { label: '4xx', data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.4 },
    { label: '5xx', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4 }
  ]
})
const statusPieChartData = ref({
  labels: ['2xx', '3xx', '4xx', '5xx', 'Other'],
  datasets: [{
    data: [],
    backgroundColor: ['#22c55e', '#6366f1', '#f59e0b', '#ef4444', '#94a3b8'],
    borderColor: 'transparent',
    borderWidth: 0
  }]
})
const errorChartData = ref({ labels: [], datasets: [{ label: '错误数', data: [], borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', fill: true, tension: 0.4 }] })
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

// 辅助函数
const formatBytes = (bytes) => {
  const n = Number(bytes || 0)
  if (!n) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(n) / Math.log(k))
  const value = (n / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)
  return `${value} ${sizes[i]}`
}

const formatDate = (filename) => {
  if (!filename) return ''
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : filename.replace('.log', '')
}

const formatFileSize = (bytes) => {
  const n = Number(bytes || 0)
  if (!n) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(n) / Math.log(k))
  const value = (n / Math.pow(k, i)).toFixed(1)
  return `${value} ${sizes[i]}`
}

const resetCharts = () => {
  statsData.value = { req: 0, ips: 0, traffic: '0 B', errors: 0 }
  requestChartData.value.labels = []
  requestChartData.value.datasets[0].data = []
  trafficChartData.value.labels = []
  trafficChartData.value.datasets[0].data = []
  statusChartData.value.labels = []
  statusChartData.value.datasets.forEach(ds => ds.data = [])
  statusPieChartData.value.datasets[0].data = []
  errorChartData.value.labels = []
  errorChartData.value.datasets[0].data = []
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
    }
  } catch (e) {
    error.value = e.message
    sites.value = []
    siteOptions.value = []
  } finally {
    loading.value = false
  }
}

const loadHistoryLogs = async () => {
  const domain = getCurrentDomain()
  if (!currentNodeId.value || !domain) return
  try {
    const resp = await fetch(`/api/forward/${currentNodeId.value}/sites/${encodeURIComponent(domain)}/logs`)
    const result = await resp.json()
    if (resp.ok && result.success) {
      historyLogFiles.value = result.data?.files || []
    }
  } catch (e) {
    console.error('获取历史日志失败:', e)
  }
}

const analyzeAccess = async (queryType) => {
  const domain = getCurrentDomain()
  if (!currentNodeId.value || !domain) return
  loading.value = true
  try {
    const resp = await fetch(`/api/forward/${currentNodeId.value}/sites/${encodeURIComponent(domain)}/logs/analyze?type=${encodeURIComponent(queryType)}`)
    const result = await resp.json()
    if (!resp.ok || !result.success) throw new Error(result.message || '分析日志失败')

    const summary = result.data?.summary || {}
    updateFromSummary(summary)
  } catch (e) {
    error.value = e.message
    resetCharts()
  } finally {
    loading.value = false
  }
}

const updateFromSummary = (summary) => {
  const totalRequests = Number(summary.totalRequests || 0)
  const uniqueIps = Number(summary.uniqueIps || 0)
  const totalBytes = Number(summary.totalBytes || 0)
  const statusGroups = summary.statusGroups || {}
  const errorsCount = Number(statusGroups['4xx'] || 0) + Number(statusGroups['5xx'] || 0)

  statsData.value = {
    req: totalRequests,
    ips: uniqueIps,
    traffic: formatBytes(totalBytes),
    errors: errorsCount
  }

  const buckets = summary.timeBuckets || []
  const labels = buckets.map(b => b.time || '')

  requestChartData.value.labels = labels
  requestChartData.value.datasets[0].data = buckets.map(b => Number(b.requests || 0))

  trafficChartData.value.labels = labels
  trafficChartData.value.datasets[0].data = buckets.map(b => Number(b.bytes || 0))

  statusChartData.value.labels = labels
  statusChartData.value.datasets[0].data = buckets.map(b => Number(b.status2xx || 0))
  statusChartData.value.datasets[1].data = buckets.map(b => Number(b.status3xx || 0))
  statusChartData.value.datasets[2].data = buckets.map(b => Number(b.status4xx || 0))
  statusChartData.value.datasets[3].data = buckets.map(b => Number(b.status5xx || 0))

  statusPieChartData.value.datasets[0].data = [
    Number(statusGroups['2xx'] || 0),
    Number(statusGroups['3xx'] || 0),
    Number(statusGroups['4xx'] || 0),
    Number(statusGroups['5xx'] || 0),
    Number(statusGroups['other'] || 0)
  ]

  errorChartData.value.labels = labels
  errorChartData.value.datasets[0].data = buckets.map(b => Number(b.status4xx || 0) + Number(b.status5xx || 0))

  topIps.value = summary.topIps || []
  topPaths.value = summary.topPaths || []
}

// 事件处理
const handleNodeSelected = (node) => {
  currentNodeId.value = node?.id ? String(node.id) : ''
  resetCharts()
  if (currentNodeId.value) loadSites()
}

const handleNodeError = (msg) => {
  error.value = msg
  currentNodeId.value = ''
  resetCharts()
}

// 监听器
watch(() => selectedDomain.value, () => {
  selectedLogRange.value = 'today'
  loadHistoryLogs()
  analyzeAccess('today-access')
})

watch(() => selectedLogRange.value, (newRange) => {
  if (newRange === 'today') {
    analyzeAccess('today-access')
  } else {
    const file = historyLogFiles.value.find(f => f.name === newRange)
    if (file) {
      const date = formatDate(file.name)
      analyzeAccess(`old${date}`)
    }
  }
})
</script>

<style scoped>


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

.range-select {
  width: 260px;
}

.stats-section {
  margin-bottom: 5px;
}

.chart-col {
  margin-bottom: 10px;
}

.error-container {
  margin-bottom: 10px;
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

  .filter-item {
    width: 100% !important;
  }
}
</style>
