<template>
  <el-card class="error-level-pie-card" shadow="never" :style="{ height: height }">
    <template #header>
      <div class="card-header">
        <span class="title">{{ title }}</span>
      </div>
    </template>
    <div class="chart-container">
      <Pie v-if="loaded" :data="chartData" :options="mergedOptions" />
      <el-empty v-else-if="!loading" description="暂无分布数据" :image-size="80" />
      <div v-else class="loading-placeholder" v-loading="true"></div>
    </div>
  </el-card>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { Pie } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  title: {
    type: String,
    default: '错误级别分布'
  },
  chartData: {
    type: Object,
    required: true
  },
  chartOptions: {
    type: Object,
    default: () => ({})
  },
  loading: {
    type: Boolean,
    default: false
  },
  height: {
    type: String,
    default: '350px'
  }
})

const loaded = ref(false)

const mergedOptions = computed(() => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#94a3b8',
          font: { size: 12 },
          padding: 20,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 10,
        displayColors: true
      }
    },
    ...props.chartOptions
  }
})

// 确保数据变化时重新渲染
watch(() => props.chartData, (newData) => {
  if (newData && newData.datasets && newData.datasets[0] && newData.datasets[0].data.length > 0) {
    loaded.value = false
    setTimeout(() => {
      loaded.value = true
    }, 0)
  } else {
    loaded.value = false
  }
}, { deep: true, immediate: true })

onMounted(() => {
  if (props.chartData && props.chartData.datasets && props.chartData.datasets[0] && props.chartData.datasets[0].data.length > 0) {
    loaded.value = true
  }
})
</script>

<style scoped>
.error-level-pie-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  border-radius: var(--el-border-radius-base);
}

.card-header {
  display: flex;
  align-items: center;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  position: relative;
  padding-left: 12px;
}

.title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 16px;
  background: var(--el-color-primary);
  border-radius: 2px;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
}

.loading-placeholder {
  width: 100%;
  height: 100%;
  min-height: 200px;
}

:deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 15px;
  overflow: hidden;
}

:deep(.el-card__header) {
  padding: 12px 15px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
</style>
