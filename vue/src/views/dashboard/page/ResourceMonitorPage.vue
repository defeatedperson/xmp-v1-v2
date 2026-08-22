<template>
  <div class="resource-monitor-page" v-loading="loading">
    <!-- 顶部筛选区域 -->
    <div class="filter-header">
      <div class="filter-left">
        <el-select v-model="selectedNodeId" placeholder="选择节点" class="filter-item node-select">
          <el-option
            v-for="node in nodeList"
            :key="node.id"
            :label="node.name"
            :value="node.id"
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

    <!-- 图表展示区域 -->
    <div class="charts-container">
      <ResourceLineChart
        title="CPU 使用率 (%)"
        :chart-data="cpuChartData"
        :min-width="chartMinWidth"
      />
      <ResourceLineChart
        title="内存 使用率 (%)"
        :chart-data="memoryChartData"
        :min-width="chartMinWidth"
      />
      <ResourceLineChart
        title="网络带宽 (Mbps)"
        :chart-data="networkChartData"
        :min-width="chartMinWidth"
      />
      <ResourceLineChart
        title="磁盘 占用率 (%)"
        :chart-data="diskChartData"
        :min-width="chartMinWidth"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import ResourceLineChart from '@/components/ResourceLineChart.vue'

// 状态管理
const loading = ref(false)
const selectedDay = ref(0)
const selectedNodeId = ref('')
const selectedGranularity = ref('hour')
const nodeList = ref([])

// 计算图表最小宽度
const chartMinWidth = computed(() => {
  if (selectedGranularity.value === 'raw') return '1800px'
  if (selectedGranularity.value === '30min') return '1200px'
  return '100%'
})

// 图表数据定义
const cpuChartData = ref({ labels: [], datasets: [] })
const memoryChartData = ref({ labels: [], datasets: [] })
const networkChartData = ref({ labels: [], datasets: [] })
const diskChartData = ref({ labels: [], datasets: [] })

// 获取节点列表
const fetchNodeList = async () => {
  try {
    const response = await fetch('/api/node/type')
    const result = await response.json()
    if (result.success && result.data) {
      const filtered = result.data
        .map(node => ({
          id: String(node.id),
          type: parseInt(node.type),
          remark: node.remark
        }))
        .filter(n => n.type === 1 || n.type === 2)

      nodeList.value = filtered.map(node => ({
        id: node.id,
        name: node.remark ? `${node.remark} (${node.id})` : `节点 ${node.id}`,
        type: node.type
      }))

      if (nodeList.value.length > 0) {
        // 默认选中 ID 最小的节点
        const minIdNode = filtered.reduce((min, cur) =>
          parseInt(cur.id) < parseInt(min.id) ? cur : min
        )
        selectedNodeId.value = String(minIdNode.id)
      }
    }
  } catch (error) {
    console.error('获取节点列表失败:', error)
  }
}

// 获取监控数据
const fetchMonitorData = async () => {
  if (!selectedNodeId.value) return

  loading.value = true
  try {
    const response = await fetch(`/api/forward/${selectedNodeId.value}/monitor?day_offset=${selectedDay.value}`)

    if (!response || !response.ok) {
      if (response?.status === 502) {
        ElMessage.error('被控连接失败，请稍后重试')
      }
      throw new Error(`HTTP ${response?.status}`)
    }

    const result = await response.json()
    if (result.success) {
      updateCharts(result.monitor_data)
    }
  } catch (error) {
    console.error('获取监控数据失败:', error)
  } finally {
    loading.value = false
  }
}

// 数据聚合处理
const aggregateData = (data, granularity) => {
  if (!data || data.length === 0) return []
  if (granularity === 'raw') return data

  const pointsPerWindow = granularity === 'hour' ? 12 : 6
  const result = []

  for (let i = 0; i < data.length; i += pointsPerWindow) {
    const window = data.slice(i, i + pointsPerWindow)
    if (window.length === 0) break

    const avg = (key) => Number((window.reduce((s, c) => s + (c[key] || 0), 0) / window.length).toFixed(2))

    result.push({
      timestamp: window[Math.floor(window.length / 2)].timestamp,
      cpu_usage: avg('cpu_usage'),
      memory_usage: avg('memory_usage'),
      upload_mbps: avg('upload_mbps'),
      download_mbps: avg('download_mbps'),
      disk_usage: avg('disk_usage')
    })
  }
  return result
}

// 时间格式化
const formatTime = (ts) => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 更新图表
const updateCharts = (rawData) => {
  const data = aggregateData(rawData, selectedGranularity.value)
  const labels = data.map(item => formatTime(item.timestamp))

  const createDataset = (label, color, values) => ({
    label,
    data: values,
    borderColor: color,
    backgroundColor: `${color}1A`,
    borderWidth: 2,
    pointRadius: 2,
    fill: true,
    tension: 0.4
  })

  cpuChartData.value = {
    labels,
    datasets: [createDataset('CPU 使用率', '#3b82f6', data.map(i => i.cpu_usage))]
  }

  memoryChartData.value = {
    labels,
    datasets: [createDataset('内存 使用率', '#10b981', data.map(i => i.memory_usage))]
  }

  networkChartData.value = {
    labels,
    datasets: [
      createDataset('上传速度', '#10b981', data.map(i => i.upload_mbps)),
      createDataset('下载速度', '#8b5cf6', data.map(i => i.download_mbps))
    ]
  }

  diskChartData.value = {
    labels,
    datasets: [createDataset('磁盘 占用', '#f59e0b', data.map(i => i.disk_usage))]
  }
}

// 监听变化
watch([selectedDay, selectedNodeId, selectedGranularity], () => {
  fetchMonitorData()
})

onMounted(() => {
  fetchNodeList()
})
</script>

<style scoped>
.resource-monitor-page {
  padding: 0;
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
  min-width: 120px;
}

.node-select {
  width: 220px;
}

.day-select {
  width: 120px;
}

.charts-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
