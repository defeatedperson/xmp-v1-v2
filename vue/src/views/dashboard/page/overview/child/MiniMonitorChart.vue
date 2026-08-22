<template>
  <div class="mini-chart-container">
    <Line v-if="loaded" :data="chartData" :options="chartOptions" />
  </div>
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
  Filler,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { ref, computed, onMounted } from 'vue'

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
)

const props = defineProps({
  data: {
    type: Array,
    default: () => [],
  },
  labels: {
    type: Array,
    default: () => [],
  },
  label: {
    type: String,
    default: '数值',
  },
  color: {
    type: String,
    default: '#3b82f6',
  },
  unit: {
    type: String,
    default: '',
  },
  max: {
    type: Number,
    default: null,
  }
})

const loaded = ref(false)

// 辅助函数：Hex颜色转RGBA
const hexToRgba = (hex, alpha) => {
  let r = 0, g = 0, b = 0
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16)
    g = parseInt(hex[2] + hex[2], 16)
    b = parseInt(hex[3] + hex[3], 16)
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16)
    g = parseInt(hex.slice(3, 5), 16)
    b = parseInt(hex.slice(5, 7), 16)
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const chartData = computed(() => {
  return {
    labels: props.labels,
    datasets: [
      {
        label: props.label,
        data: props.data,
        borderColor: props.color,
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 100);
          gradient.addColorStop(0, hexToRgba(props.color, 0.2));
          gradient.addColorStop(1, hexToRgba(props.color, 0.0));
          return gradient;
        },
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: props.color,
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const chartOptions = computed(() => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 8,
        displayColors: false,
        callbacks: {
          title: (context) => context[0].label,
          label: (context) => `${context.dataset.label}: ${context.parsed.y} ${props.unit}`,
        }
      },
    },
    scales: {
      x: {
        display: false,
        grid: {
          display: false,
        },
      },
      y: {
        display: false,
        min: 0,
        max: props.max,
        grid: {
          display: false,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  }
})

onMounted(() => {
  loaded.value = true
})
</script>

<style scoped>
.mini-chart-container {
  width: 100%;
  height: 100%;
  min-height: 80px;
  position: relative;
  overflow: hidden;
}
</style>
