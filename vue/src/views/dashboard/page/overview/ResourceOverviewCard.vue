<template>
  <el-card class="resource-overview-card" shadow="never" v-loading="loadingList">
    <template #header>
      <div class="card-header">
        <span class="title">资源概览</span>
        <el-select
          v-model="selectedNodeId"
          placeholder="选择节点"
          size="small"
          style="width: 220px"
          filterable
        >
          <el-option
            v-for="node in nodeList"
            :key="node.id"
            :label="node.name"
            :value="node.id"
          />
        </el-select>
      </div>
    </template>

    <div v-if="selectedNodeId" class="monitor-content" v-loading="loadingData">
      <el-row :gutter="16" class="monitor-row">
        <!-- 机器配置 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="never" class="sub-card info-card">
            <template #header>
              <div class="sub-title">机器配置</div>
            </template>
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="CPU">
                <span class="truncate-text" :title="machineInfo.cpuModel">
                  {{ machineInfo.cpuModel || '-' }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="核心">{{ machineInfo.cpuCores }}</el-descriptions-item>
              <el-descriptions-item label="内存">{{ machineInfo.memory }}</el-descriptions-item>
              <el-descriptions-item label="磁盘">{{ machineInfo.disk }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <!-- 实时状态 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="never" class="sub-card realtime-card">
            <template #header>
              <div class="sub-title">
                实时状态
                <el-tag :type="isOnline ? 'success' : 'info'" size="small" effect="dark">
                  {{ statusText }}
                </el-tag>
              </div>
            </template>
            <div class="realtime-body">
              <div class="rt-item">
                <span class="label">CPU</span>
                <el-progress
                  :percentage="Number(realtimeData.cpu)"
                  :color="getProgressColor"
                  :stroke-width="12"
                  striped
                  striped-flow
                />
              </div>
              <div class="rt-item">
                <span class="label">内存</span>
                <el-progress
                  :percentage="Number(realtimeData.memory)"
                  :color="getProgressColor"
                  :stroke-width="12"
                  striped
                  striped-flow
                />
              </div>
              <div class="traffic-stats">
                <div class="stat-item">
                  <i class="fas fa-arrow-up up-icon"></i>
                  <div class="stat-content">
                    <div class="stat-title">月上传</div>
                    <div class="stat-value">{{ trafficInfo.upload }}</div>
                  </div>
                </div>
                <div class="stat-item">
                  <i class="fas fa-arrow-down down-icon"></i>
                  <div class="stat-content">
                    <div class="stat-title">月下载</div>
                    <div class="stat-value">{{ trafficInfo.download }}</div>
                  </div>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- CPU 趋势 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="never" class="sub-card chart-card">
            <template #header>
              <div class="sub-title">
                <span>CPU 趋势</span>
                <span class="value-tag" :style="{ color: getProgressColor(realtimeData.cpu) }">
                  {{ realtimeData.cpu }}%
                </span>
              </div>
            </template>
            <div class="chart-wrapper">
              <MiniMonitorChart :data="chartData.cpu" :labels="chartLabels" label="CPU" color="#3b82f6" unit="%" :max="100" />
            </div>
          </el-card>
        </el-col>

        <!-- 内存 趋势 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="never" class="sub-card chart-card">
            <template #header>
              <div class="sub-title">
                <span>内存 趋势</span>
                <span class="value-tag" :style="{ color: getProgressColor(realtimeData.memory) }">
                  {{ realtimeData.memory }}%
                </span>
              </div>
            </template>
            <div class="chart-wrapper">
              <MiniMonitorChart :data="chartData.memory" :labels="chartLabels" label="内存" color="#10b981" unit="%" :max="100" />
            </div>
          </el-card>
        </el-col>

        <!-- 上传趋势 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="never" class="sub-card chart-card">
            <template #header>
              <div class="sub-title">
                <span>上传趋势</span>
                <span class="value-tag">
                  {{ realtimeData.upload }} Mbps
                </span>
              </div>
            </template>
            <div class="chart-wrapper">
              <MiniMonitorChart :data="chartData.network" :labels="chartLabels" label="上传" color="#8b5cf6" unit="Mbps" />
            </div>
          </el-card>
        </el-col>

        <!-- 下载趋势 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="never" class="sub-card chart-card">
            <template #header>
              <div class="sub-title">
                <span>下载趋势</span>
                <span class="value-tag">
                  {{ realtimeData.download }} Mbps
                </span>
              </div>
            </template>
            <div class="chart-wrapper">
              <MiniMonitorChart :data="chartData.download" :labels="chartLabels" label="下载" color="#22c55e" unit="Mbps" />
            </div>
          </el-card>
        </el-col>

        <!-- 磁盘趋势 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="never" class="sub-card chart-card">
            <template #header>
              <div class="sub-title">
                <span>磁盘 趋势</span>
                <span class="value-tag" :style="{ color: getProgressColor(realtimeData.disk) }">
                  {{ realtimeData.disk }}%
                </span>
              </div>
            </template>
            <div class="chart-wrapper">
              <MiniMonitorChart :data="chartData.disk" :labels="chartLabels" label="磁盘" color="#f59e0b" unit="%" :max="100" />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
    <el-empty v-else description="请选择节点查看资源概览" />
  </el-card>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import MiniMonitorChart from './child/MiniMonitorChart.vue'

const loadingList = ref(false)
const loadingData = ref(false)
const nodeList = ref([])
const selectedNodeId = ref('')
const isOnline = ref(false)
const refreshInterval = ref(null)

const machineInfo = ref({
  cpuModel: '',
  cpuCores: '-',
  memory: '-',
  disk: '-',
})

const realtimeData = ref({
  cpu: '0.00',
  memory: '0.00',
  disk: '0.00',
  upload: '0.00',
  download: '0.00',
})

const trafficInfo = ref({
  upload: '0 GB',
  download: '0 GB',
})

const chartData = ref({
  cpu: [],
  memory: [],
  network: [],
  download: [],
  disk: [],
})

const chartLabels = ref([])

const getProgressColor = (percentage) => {
  if (percentage >= 80) return 'var(--el-color-danger)'
  if (percentage >= 60) return 'var(--el-color-warning)'
  return 'var(--el-color-success)'
}

const statusText = computed(() => {
  if (!selectedNodeId.value) return '未选择'
  return isOnline.value ? '在线' : '离线'
})

const fetchNodeList = async () => {
  loadingList.value = true
  try {
    const response = await fetch('/api/node/type')
    if (!response.ok) {
      if (response.status === 502) {
        ElMessage.error('被控连接失败，请稍后重试')
      }
      throw new Error(`HTTP ${response.status}`)
    }
    const result = await response.json()
    if (result.success && result.data && result.data.length > 0) {
      const filtered = result.data
        .map((node) => ({ id: node.id, type: parseInt(node.type), remark: node.remark }))
        .filter((n) => n.type === 1 || n.type === 2)

      nodeList.value = filtered.map((node) => ({
        id: String(node.id),
        name: node.remark ? `${node.remark} (${node.id})` : `节点${node.id}`,
        type: node.type,
      }))

      if (nodeList.value.length > 0) {
        const minIdNode = filtered.reduce((min, current) =>
          parseInt(current.id) < parseInt(min.id) ? current : min,
        )
        selectedNodeId.value = String(minIdNode.id)
      }
    }
  } catch (error) {
    console.error('获取节点列表失败:', error)
  } finally {
    loadingList.value = false
  }
}

const resetData = () => {
  chartData.value = { cpu: [], memory: [], network: [], download: [], disk: [] }
  chartLabels.value = []
  trafficInfo.value = { upload: '0 GB', download: '0 GB' }
  machineInfo.value = { cpuModel: '', cpuCores: '-', memory: '-', disk: '-' }
  realtimeData.value = { cpu: '0.00', memory: '0.00', disk: '0.00', upload: '0.00', download: '0.00' }
  isOnline.value = false
}

const formatStorage = (mb) => {
  if (!mb) return '0 GB'
  if (mb < 1024) return `${mb} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

const formatMemory = (mb) => {
  if (!mb) return '0.00 GB'
  return `${(mb / 1024).toFixed(2)} GB`
}

const formatTraffic = (mb) => {
  if (!mb || mb === 0) return '0 MB'
  if (mb < 1024) return `${Number(mb).toFixed(2)} MB`
  const gb = mb / 1024
  if (gb < 1024) return `${gb.toFixed(2)} GB`
  const tb = gb / 1024
  return `${tb.toFixed(2)} TB`
}

const formatWindowLabel = (timestamp) => {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return String(timestamp)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

const aggregateTo2Hours = (data) => {
  const pointsPerWindow = 24
  const out = { cpu: [], memory: [], network: [], download: [], disk: [] }
  const labels = []

  if (!Array.isArray(data) || data.length === 0) return { series: out, labels }

  for (let i = 0; i < data.length; i += pointsPerWindow) {
    const window = data.slice(i, i + pointsPerWindow)
    if (window.length === 0) break
    labels.push(formatWindowLabel(window[0]?.timestamp))
    out.cpu.push(Number((window.reduce((sum, item) => sum + (item.cpu_usage || 0), 0) / window.length).toFixed(1)))
    out.memory.push(Number((window.reduce((sum, item) => sum + (item.memory_usage || 0), 0) / window.length).toFixed(1)))
    out.network.push(Number((window.reduce((sum, item) => sum + (item.upload_mbps || 0), 0) / window.length).toFixed(2)))
    out.download.push(Number((window.reduce((sum, item) => sum + (item.download_mbps || 0), 0) / window.length).toFixed(2)))
    out.disk.push(Number((window.reduce((sum, item) => sum + (item.disk_usage || 0), 0) / window.length).toFixed(1)))
  }

  return { series: out, labels }
}

const fetchMonitorData = async () => {
  if (!selectedNodeId.value) return
  loadingData.value = true
  try {
    const response = await fetch(`/api/forward/${selectedNodeId.value}/monitor?day_offset=0`)

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()

    if (result.success) {
      const trafficData = result.monthly_traffic || result.data?.monthly_traffic
      if (trafficData) {
        trafficInfo.value = {
          upload: formatTraffic(trafficData.upload || 0),
          download: formatTraffic(trafficData.download || 0),
        }
      }

      const deviceInfo = result.device_info || result.data?.device_info
      if (deviceInfo) {
        machineInfo.value = {
          cpuModel: deviceInfo.CPUModel || '未知型号',
          cpuCores: deviceInfo.Cores ? `${deviceInfo.Cores}核` : '-',
          memory: formatMemory(deviceInfo.MemorySizeMB || 0),
          disk: formatStorage(deviceInfo.DiskSizeMB || 0),
        }
      }
      const monitorData = result.monitor_data || result.data?.monitor_data || []
      const aggregated = aggregateTo2Hours(monitorData)
      chartData.value = aggregated.series
      chartLabels.value = aggregated.labels

      const last = monitorData.length > 0 ? monitorData[monitorData.length - 1] : null
      if (last) {
        realtimeData.value.disk = Number(last.disk_usage || 0).toFixed(2)
        realtimeData.value.upload = Number(last.upload_mbps || 0).toFixed(2)
        realtimeData.value.download = Number(last.download_mbps || 0).toFixed(2)
        realtimeData.value.cpu = Number(last.cpu_usage || 0).toFixed(2)
        realtimeData.value.memory = Number(last.memory_usage || 0).toFixed(2)
      }
    }
  } catch (error) {
    console.error('获取监控数据失败:', error)
  } finally {
    loadingData.value = false
  }
}

const fetchRealtimeData = async () => {
  if (!selectedNodeId.value) return
  try {
    const response = await fetch(`/api/forward/${selectedNodeId.value}/system`)
    const result = await response.json()
    if (result.success && result.data) {
      isOnline.value = true
      realtimeData.value.cpu = Number(result.data.cpu || 0).toFixed(2)
      realtimeData.value.memory = Number(result.data.memory || 0).toFixed(2)
      if (result.data.disk !== undefined) {
        realtimeData.value.disk = Number(result.data.disk || 0).toFixed(2)
      }
      if (result.data.up !== undefined) {
        realtimeData.value.upload = Number(result.data.up || 0).toFixed(2)
      }
      if (result.data.down !== undefined) {
        realtimeData.value.download = Number(result.data.down || 0).toFixed(2)
      }
    } else {
      isOnline.value = false
    }
  } catch {
    isOnline.value = false
  }
}

onMounted(() => {
  fetchNodeList()
  refreshInterval.value = setInterval(() => {
    fetchRealtimeData()
  }, 30000)
})

onUnmounted(() => {
  if (refreshInterval.value) clearInterval(refreshInterval.value)
})

watch(selectedNodeId, () => {
  resetData()
  fetchMonitorData()
  fetchRealtimeData()
})
</script>

<style scoped>
.resource-overview-card {
  margin-top: 10px;
  border-radius: var(--el-border-radius-base);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.card-header .title {
  font-weight: bold;
}

.monitor-row {
  row-gap: 16px;
}

.sub-card {
  height: 100%;
}

.sub-title {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.value-tag {
  font-family: monospace;
  font-size: 13px;
}

.truncate-text {
  display: block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.realtime-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rt-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rt-item .label {
  width: 40px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.rt-item :deep(.el-progress) {
  flex: 1;
}

.traffic-stats {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}

.stat-value {
  font-size: 14px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.up-icon { color: var(--el-color-primary); }
.down-icon { color: var(--el-color-success); }

.stat-item :deep(.el-statistic__title) {
  font-size: 11px;
}

.stat-item :deep(.el-statistic__content) {
  font-size: 13px;
  font-weight: bold;
}

.chart-wrapper {
  height: 120px;
}
</style>
