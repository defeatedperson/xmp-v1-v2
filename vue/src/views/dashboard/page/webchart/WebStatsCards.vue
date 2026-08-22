<template>
  <el-row :gutter="10" class="web-stats-cards">
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
      ips: '0',
      traffic: '0 B',
      errors: '0'
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
    title: '独立IP数',
    value: Number(String(props.stats.ips || '0').replace(/,/g, '')) || 0,
    icon: 'fas fa-users',
    color: 'var(--el-color-success)',
  },
  {
    title: '总流量',
    value: Number(String(props.stats.traffic || '0').split(' ')[0]) || 0,
    unit: String(props.stats.traffic || 'B').split(' ')[1] || 'B',
    icon: 'fas fa-exchange-alt',
    color: 'var(--el-color-info)',
  },
  {
    title: '错误请求',
    value: Number(String(props.stats.errors || '0').replace(/,/g, '')) || 0,
    icon: 'fas fa-exclamation-triangle',
    color: 'var(--el-color-danger)',
  }
])
</script>

<style scoped>
.web-stats-cards {
  margin-bottom: -40px;
}

.stat-card {
  border-radius: var(--el-border-radius-base);

  min-width: 140px;
  margin-bottom: 5px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
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
  .web-stats-cards .el-col {
    margin-bottom: 0;
  }
}
</style>
