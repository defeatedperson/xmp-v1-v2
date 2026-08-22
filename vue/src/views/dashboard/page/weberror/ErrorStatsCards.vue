<template>
  <el-row :gutter="10" class="error-stats-cards">
    <el-col :xs="12" :sm="6" :md="6" :lg="6" v-for="card in statsList" :key="card.title">
      <el-card shadow="never" class="stat-card">
        <template v-if="card.type === 'text'">
          <div class="el-statistic">
            <div class="el-statistic__title">{{ card.title }}</div>
            <div class="el-statistic__content">
              <span class="el-statistic__prefix" v-if="card.icon">
                <i :class="[card.icon, 'stat-icon']" :style="{ color: card.color }"></i>
              </span>
              <span class="text-value" :title="card.value">{{ card.value }}</span>
            </div>
          </div>
        </template>
        <el-statistic v-else :value="card.value" :title="card.title">
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
      totalErrors: '0',
      lines: '0',
      domain: '-',
      durationMs: '0'
    })
  }
})

const statsList = computed(() => [
  {
    title: '总错误数',
    value: Number(String(props.stats.totalErrors || '0').replace(/,/g, '')) || 0,
    icon: 'fas fa-exclamation-triangle',
    color: 'var(--el-color-danger)',
  },
  {
    title: '分析行数',
    value: Number(String(props.stats.lines || '0').replace(/,/g, '')) || 0,
    icon: 'fas fa-list-ol',
    color: 'var(--el-color-primary)',
  },
  {
    title: '分析耗时',
    value: Number(props.stats.durationMs) || 0,
    unit: 'ms',
    icon: 'fas fa-stopwatch',
    color: 'var(--el-color-warning)',
  },
  {
    title: '日志来源',
    value: props.stats.domain || '-',
    icon: 'fas fa-globe',
    color: 'var(--el-color-success)',
    type: 'text'
  }
])
</script>

<style scoped>
.error-stats-cards {
  margin-bottom: 0px;
}

.stat-card {
  border-radius: var(--el-border-radius-base);

  min-width: 140px;
  margin-bottom: 8px;
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

.text-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  max-width: 100%;
}

:deep(.el-statistic__content) {
  display: flex;
  align-items: baseline;
}

:deep(.el-statistic__title) {
  font-size: 13px;
  margin-bottom: 8px;
}

/* 针对日志来源这种长字符串的特殊处理 */
:deep(.el-statistic__content .el-statistic__number) {
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

@media (max-width: 768px) {
  .error-stats-cards .el-col {
    margin-bottom: 0;
  }
}
</style>
