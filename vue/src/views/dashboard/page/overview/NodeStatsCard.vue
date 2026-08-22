<template>
  <div class="node-stats-container">
    <el-row :gutter="10">
      <el-col :xs="12" :sm="6" :md="6" :lg="6">
        <el-card shadow="never" class="stat-card">
          <el-statistic :value="stats.total" title="节点总数">
            <template #prefix>
              <i class="fas fa-server stat-icon total"></i>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6" :md="6" :lg="6">
        <el-card shadow="never" class="stat-card">
          <el-statistic :value="stats.controlled" title="被控节点">
            <template #prefix>
              <i class="fas fa-terminal stat-icon controlled"></i>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6" :md="6" :lg="6">
        <el-card shadow="never" class="stat-card">
          <el-statistic :value="stats.monitored" title="监控节点">
            <template #prefix>
              <i class="fas fa-eye stat-icon monitored"></i>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6" :md="6" :lg="6">
        <el-card shadow="never" class="stat-card">
          <el-statistic :value="stats.edge" title="边缘节点">
            <template #prefix>
              <i class="fas fa-network-wired stat-icon edge"></i>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const stats = ref({
  total: 0,
  controlled: 0,
  monitored: 0,
  edge: 0
})

const fetchNodeStats = async () => {
  try {
    const response = await fetch('/api/node/type')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const result = await response.json()
    if (result.success && Array.isArray(result.data)) {
      const nodes = result.data
      stats.value = {
        total: nodes.length,
        controlled: nodes.filter(n => String(n.type) === '1').length,
        monitored: nodes.filter(n => String(n.type) === '2').length,
        edge: nodes.filter(n => String(n.type) === '3').length
      }
    }
  } catch (error) {
    console.error('获取节点统计失败:', error)
    ElMessage.error('获取节点统计失败')
  }
}

onMounted(() => {
  fetchNodeStats()
})
</script>

<style scoped>
.node-stats-container {
  margin-bottom: 10px;
}

.stat-card {
  border-radius: var(--el-border-radius-base);

  min-width: 140px;
  margin-bottom: 14px;
}


.stat-icon {
  margin-right: 8px;
  font-size: 18px;
}

.stat-icon.total { color: var(--el-color-primary); }
.stat-icon.controlled { color: var(--el-color-success); }
.stat-icon.monitored { color: var(--el-color-warning); }
.stat-icon.edge { color: var(--el-color-danger); }

</style>
