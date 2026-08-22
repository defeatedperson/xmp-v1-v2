<template>
  <el-card class="resource-line-chart" shadow="never">
    <template #header v-if="title">
      <div class="chart-header">
        <span class="title-text">{{ title }}</span>
        <slot name="extra"></slot>
      </div>
    </template>

    <div class="chart-wrapper">
      <div class="chart-container" :style="{ minWidth: minWidth }">
        <Line v-if="loaded" :data="chartData" :options="mergedOptions" />
      </div>
    </div>
  </el-card>
</template>

<script setup>
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { ref, onMounted, watch, computed } from 'vue'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  chartData: {
    type: Object,
    required: true,
  },
  chartOptions: {
    type: Object,
    default: () => ({}),
  },
  minWidth: {
    type: String,
    default: '1200px'
  }
})

const loaded = ref(false)

// 默认图表配置，符合 Element Plus 暗色风格
const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top',
      align: 'end',
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        boxWidth: 8,
        padding: 20,
        font: {
          size: 12
        }
      },
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      borderColor: 'rgba(51, 65, 85, 0.8)',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 8,
      displayColors: true,
      usePointStyle: true
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
        color: 'rgba(148, 163, 184, 0.1)',
      },
      ticks: {
        color: '#94a3b8',
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 24,
        font: {
          size: 11
        }
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(148, 163, 184, 0.1)',
        drawBorder: false
      },
      ticks: {
        color: '#94a3b8',
        font: {
          size: 11
        },
        padding: 8
      },
    },
  },
  interaction: {
    mode: 'index',
    intersect: false,
  },
}

// 合并配置
const mergedOptions = computed(() => {
  return {
    ...defaultOptions,
    ...props.chartOptions,
    plugins: {
      ...defaultOptions.plugins,
      ...props.chartOptions.plugins,
      legend: {
        ...defaultOptions.plugins.legend,
        ...props.chartOptions.plugins?.legend
      },
      tooltip: {
        ...defaultOptions.plugins.tooltip,
        ...props.chartOptions.plugins?.tooltip
      }
    },
    scales: {
      ...defaultOptions.scales,
      ...props.chartOptions.scales
    }
  }
})

onMounted(() => {
  loaded.value = true
})

// 监听数据变化，强制触发图表重绘
watch(
  () => props.chartData,
  () => {
    loaded.value = false
    setTimeout(() => {
      loaded.value = true
    }, 0)
  },
  { deep: true },
)
</script>

<style scoped>
.resource-line-chart {
  --el-card-padding: 20px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-text::before {
  content: '';
  width: 4px;
  height: 16px;
  background: linear-gradient(to bottom, var(--el-color-primary), var(--el-color-primary-light-5));
  border-radius: 2px;
}

.chart-wrapper {
  overflow-x: auto;
  width: 100%;
  /* 隐藏滚动条但保留滚动功能 (可选) */
  scrollbar-width: thin;
  scrollbar-color: var(--el-border-color-lighter) transparent;
}

.chart-wrapper::-webkit-scrollbar {
  height: 6px;
}

.chart-wrapper::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-lighter);
  border-radius: 3px;
}

.chart-container {
  position: relative;
  height: 400px;
  width: 100%;
}

:deep(.el-card__header) {
  padding: 15px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
</style>
