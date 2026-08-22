<template>
  <el-row :gutter="10" class="xcc-stats-cards">
    <el-col :xs="12" :sm="6" :md="6" :lg="6" v-for="card in statsList" :key="card.title">
      <el-card shadow="never" class="stat-card">
        <el-statistic :value="card.value" :title="card.title">
          <template #prefix>
            <i :class="[card.icon, 'stat-icon']" :style="{ color: card.color }"></i>
          </template>
          <template #suffix v-if="card.unit">
            <span class="stat-unit">{{ card.unit }}</span>
          </template>
        </el-statistic>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  stats: {
    type: Object,
    required: true,
    default: () => ({
      req: '0',
      trafficIn: '0 B',
      trafficOut: '0 B',
      hitRate: '0%'
    })
  }
})

const statsList = computed(() => [
  {
    title: '总请求数',
    value: Number(String(props.stats.req || '0').replace(/,/g, '')) || 0,
    icon: 'fas fa-chart-line',
    color: 'var(--el-color-primary)',
  },
  {
    title: '入站流量',
    value: Number(String(props.stats.trafficIn || '0').split(' ')[0]) || 0,
    unit: String(props.stats.trafficIn || 'B').split(' ')[1] || 'B',
    icon: 'fas fa-arrow-down',
    color: 'var(--el-color-success)',
  },
  {
    title: '出站流量',
    value: Number(String(props.stats.trafficOut || '0').split(' ')[0]) || 0,
    unit: String(props.stats.trafficOut || 'B').split(' ')[1] || 'B',
    icon: 'fas fa-arrow-up',
    color: 'var(--el-color-info)',
  },
  {
    title: '缓存命中率',
    value: Number(String(props.stats.hitRate || '0').replace('%', '')) || 0,
    unit: '%',
    icon: 'fas fa-bolt',
    color: 'var(--el-color-warning)',
  }
])
</script>

<style scoped>
.xcc-stats-cards {
  margin-bottom: -15px;
}

.stat-card {
  border-radius: var(--el-border-radius-base);

  min-width: 140px;
  margin-bottom: 16px;
}


.stat-icon {
  margin-right: 8px;
  font-size: 18px;
}

.stat-unit {
  font-size: 14px;
  margin-left: 4px;
  color: var(--el-text-color-secondary);
}

:deep(.el-statistic__content) {
  display: flex;
  align-items: baseline;
}

@media (max-width: 768px) {
  .xcc-stats-cards .el-col {
    margin-bottom: 0;
  }
}
</style>
