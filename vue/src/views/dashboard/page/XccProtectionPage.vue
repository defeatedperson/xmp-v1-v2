<template>
  <div class="xcc-protection-page">
    <!-- 筛选头部 -->
    <div class="filter-header">
      <div class="filter-left">
        <NodeSelector :node-type="3" @node-selected="onNodeSelected" />

        <el-select v-model="selectedDomain" placeholder="选择域名" class="filter-item domain-select">
          <el-option
            v-for="domain in domainList"
            :key="domain"
            :label="domain"
            :value="domain"
          />
        </el-select>

        <el-select v-model="selectedDay" placeholder="选择日期" class="filter-item day-select">
          <el-option label="今日" :value="0" />
          <el-option label="昨日" :value="1" />
          <el-option label="前日" :value="2" />
          <el-option label="3日前" :value="3" />
          <el-option label="4日前" :value="4" />
          <el-option label="5日前" :value="5" />
          <el-option label="6日前" :value="6" />
        </el-select>
      </div>
      <div class="filter-right">
        <el-radio-group v-model="selectedGranularity">
          <el-radio-button value="hour">按小时</el-radio-button>
          <el-radio-button value="30min">30分钟</el-radio-button>
          <el-radio-button value="raw">原始数据</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 统计信息公告 -->
    <el-alert
      title="统计说明"
      type="info"
      description="数据均为过滤CC攻击后的统计数据"
      show-icon
      :closable="false"
      class="data-notice"
    />

    <!-- 汇总统计卡片 -->
    <XccStatsCards :stats="summaryStats" v-loading="loading" />

    <!-- 图表展示区域 -->
    <div class="charts-container" v-loading="loading">
      <el-row :gutter="10">
        <el-col :span="24">
          <ResourceLineChart
            title="请求数 (次)"
            :chart-data="requestChartData"
            :min-width="chartMinWidth"
          />
        </el-col>
        <el-col :span="24">
          <ResourceLineChart
            title="流量趋势"
            :chart-data="trafficChartData"
            :min-width="chartMinWidth"
          />
        </el-col>
        <el-col :span="24">
          <ResourceLineChart
            title="状态码分布"
            :chart-data="statusChartData"
            :min-width="chartMinWidth"
          />
        </el-col>
        <el-col :span="24">
          <ResourceLineChart
            title="缓存命中率 (%)"
            :chart-data="cacheHitChartData"
            :min-width="chartMinWidth"
          />
        </el-col>
      </el-row>

      <!-- 日志表格组件 -->
      <XccLogTable :node-id="selectedNodeId" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import NodeSelector from '@/components/NodeSelector.vue'
import ResourceLineChart from '@/components/ResourceLineChart.vue'
import XccStatsCards from './xcc/XccStatsCards.vue'
import XccLogTable from './xcc/XccLogTable.vue'

// 状态管理
const loading = ref(false)
const selectedNodeId = ref('')
const selectedDomain = ref('')
const selectedDay = ref(0)
const selectedGranularity = ref('hour')
const domainList = ref([])
const rawMonitorData = ref([])

const summaryStats = ref({
  req: 0,
  trafficIn: '0 B',
  trafficOut: '0 B',
  hitRate: 0
})

// 计算图表最小宽度
const chartMinWidth = computed(() => {
  if (selectedGranularity.value === 'raw') return '1800px'
  if (selectedGranularity.value === '30min') return '1200px'
  return '100%'
})

// 图表数据定义
const requestChartData = ref({ labels: [], datasets: [] })
const trafficChartData = ref({ labels: [], datasets: [] })
const statusChartData = ref({ labels: [], datasets: [] })
const cacheHitChartData = ref({ labels: [], datasets: [] })

// 初始化图表基础配置
const initChartData = () => {
  requestChartData.value = {
    labels: [],
    datasets: [{
      label: '请求数',
      data: [],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4
    }]
  }
  trafficChartData.value = {
    labels: [],
    datasets: [
      {
        label: '入站流量',
        data: [],
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      },
      {
        label: '出站流量',
        data: [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }
    ]
  }
  statusChartData.value = {
    labels: [],
    datasets: [
      {
        label: '2xx',
        data: [],
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      },
      {
        label: '4xx',
        data: [],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      },
      {
        label: '5xx',
        data: [],
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }
    ]
  }
  cacheHitChartData.value = {
    labels: [],
    datasets: [{
      label: '命中率(%)',
      data: [],
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4
    }]
  }
}

// 格式化流量
const formatTraffic = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 ** 3) return (bytes / (1024 ** 2)).toFixed(2) + ' MB'
  return (bytes / (1024 ** 3)).toFixed(2) + ' GB'
}

// 数据聚合逻辑
const aggregateData = (rows, granularity) => {
  if (!rows || rows.length === 0) return []
  if (granularity === 'raw') return rows

  const interval = granularity === 'hour' ? 3600 : 1800
  const buckets = {}

  rows.forEach(r => {
    const ts = Number(r.ts)
    const bucketTs = ts - (ts % interval)
    if (!buckets[bucketTs]) {
      buckets[bucketTs] = {
        ts: bucketTs,
        fmt_time: '',
        req_count: 0,
        bytes_in: 0,
        bytes_out: 0,
        cache_hit_count: 0,
        status_2xx: 0,
        status_3xx: 0,
        status_4xx: 0,
        status_5xx: 0
      }
    }
    const b = buckets[bucketTs]
    b.req_count += (r.req_count || 0)
    b.bytes_in += Number(r.bytes_in || 0)
    b.bytes_out += Number(r.bytes_out || 0)
    b.cache_hit_count += (r.cache_hit_count || 0)
    b.status_2xx += (r.status_2xx || 0)
    b.status_3xx += (r.status_3xx || 0)
    b.status_4xx += (r.status_4xx || 0)
    b.status_5xx += (r.status_5xx || 0)
  })

  return Object.values(buckets).sort((a, b) => a.ts - b.ts).map(b => {
    const d = new Date(b.ts * 1000)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    b.fmt_time = `${hh}:${mm}`
    return b
  })
}

// 更新图表
const updateCharts = () => {
  const rows = aggregateData(rawMonitorData.value, selectedGranularity.value)

  const labels = rows.map(r => {
    if (r.fmt_time) return r.fmt_time
    const d = new Date(Number(r.ts) * 1000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  // 请求数
  requestChartData.value.labels = labels
  requestChartData.value.datasets[0].data = rows.map(r => r.req_count || 0)

  // 流量
  const inboundBytes = rows.map(r => Number(r.bytes_in || 0))
  const outboundBytes = rows.map(r => Number(r.bytes_out || 0))

  const chooseUnit = (maxBytes) => {
    if (maxBytes < 1024) return { unit: 'B', factor: 1, decimals: 0 }
    if (maxBytes < 1024 ** 2) return { unit: 'KB', factor: 1024, decimals: 2 }
    if (maxBytes < 1024 ** 3) return { unit: 'MB', factor: 1024 ** 2, decimals: 2 }
    return { unit: 'GB', factor: 1024 ** 3, decimals: 3 }
  }

  const maxTraffic = Math.max(0, ...inboundBytes, ...outboundBytes)
  const cfg = chooseUnit(maxTraffic)

  trafficChartData.value.labels = labels
  trafficChartData.value.datasets[0].label = `入站流量 (${cfg.unit})`
  trafficChartData.value.datasets[0].data = inboundBytes.map(b => +(b / cfg.factor).toFixed(cfg.decimals))
  trafficChartData.value.datasets[1].label = `出站流量 (${cfg.unit})`
  trafficChartData.value.datasets[1].data = outboundBytes.map(b => +(b / cfg.factor).toFixed(cfg.decimals))

  // 状态码
  statusChartData.value.labels = labels
  statusChartData.value.datasets[0].data = rows.map(r => r.status_2xx || 0)
  statusChartData.value.datasets[1].data = rows.map(r => r.status_4xx || 0)
  statusChartData.value.datasets[2].data = rows.map(r => r.status_5xx || 0)

  // 缓存命中率
  cacheHitChartData.value.labels = labels
  cacheHitChartData.value.datasets[0].data = rows.map(r => {
    const req = r.req_count || 0
    const hit = r.cache_hit_count || 0
    return req > 0 ? +((hit / req) * 100).toFixed(2) : 0
  })
}

// 获取域名列表
const fetchDomains = async () => {
  if (!selectedNodeId.value) {
    domainList.value = []
    selectedDomain.value = ''
    return
  }
  try {
    const resp = await fetch(`/api/xcc/domains`)
    if (!resp.ok) {
      if (resp.status === 500) {
        ElMessage.error('被控连接失败，请稍后重试')
      }
      throw new Error(`HTTP ${resp.status}`)
    }
    const result = await resp.json()
    const list = Array.isArray(result && result.data) ? result.data : []
    domainList.value = list
    if (!selectedDomain.value && list.length > 0) {
      selectedDomain.value = list[0]
    }
  } catch (err) {
    console.error('获取域名列表失败:', err)
    domainList.value = []
    selectedDomain.value = ''
  }
}

// 获取监控统计数据
const fetchStats = async () => {
  if (!selectedNodeId.value || !selectedDomain.value) return
  loading.value = true
  try {
    const url = `/api/forward/${selectedNodeId.value}/admin/stats/day?domain=${encodeURIComponent(selectedDomain.value)}&day=${selectedDay.value}`
    const resp = await fetch(url)

    if (!resp.ok) {
      if (resp.status === 500) {
        ElMessage.error('被控连接失败，请稍后重试')
      }
      throw new Error(`HTTP ${resp.status}`)
    }

    const result = await resp.json()
    if (!result || !result.rows) return

    const rawRows = Array.isArray(result.rows) ? result.rows : []
    rawMonitorData.value = rawRows

    // 计算汇总信息
    let sumReq = 0, sumIn = 0, sumOut = 0, sumHit = 0
    rawRows.forEach(r => {
      sumReq += (r.req_count || 0)
      sumIn += Number(r.bytes_in || 0)
      sumOut += Number(r.bytes_out || 0)
      sumHit += (r.cache_hit_count || 0)
    })

    summaryStats.value = {
      req: sumReq,
      trafficIn: formatTraffic(sumIn),
      trafficOut: formatTraffic(sumOut),
      hitRate: sumReq > 0 ? Number(((sumHit / sumReq) * 100).toFixed(2)) : 0
    }

    updateCharts()
  } catch (err) {
    console.error('获取统计数据失败:', err)
    ElMessage.error('数据加载失败，请重试')
  } finally {
    loading.value = false
  }
}

// 事件处理
const onNodeSelected = (node) => {
  selectedNodeId.value = node?.id ? String(node.id) : ''
}

// 监听器
watch(selectedNodeId, () => {
  fetchDomains()
})

watch([selectedNodeId, selectedDomain, selectedDay], () => {
  fetchStats()
})

watch(selectedGranularity, () => {
  updateCharts()
})

onMounted(() => {
  initChartData()
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
  min-width: 120px;
}

.domain-select {
  width: 200px;
}

.day-select {
  width: 120px;
}

.data-notice {
  margin-bottom: 10px;
  border-radius: 8px;
}

.charts-container {
  margin-top: 10px;
}

.el-col {
  margin-bottom: 10px;
}

/* 响应式调整 */
@media (max-width: 1000px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .filter-left, .filter-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .filter-item {
    flex: 1;
    min-width: 100px;
  }
}
</style>
