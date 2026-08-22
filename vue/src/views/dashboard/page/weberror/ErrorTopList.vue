<template>
  <el-card class="error-top-list-card" shadow="never" :style="{ height: height }">
    <template #header>
      <div class="card-header">
        <span class="title">{{ title }}</span>
      </div>
    </template>

    <div class="list-container custom-scrollbar">
      <template v-if="items && items.length > 0">
        <div v-for="(item, index) in items" :key="index" class="list-item">
          <div class="item-info">
            <span class="item-key" :title="item.key">{{ item.key }}</span>
            <span class="item-count">{{ formatNumber(item.count) }}</span>
          </div>
          <el-progress
            :percentage="getPercentage(item.count)"
            :show-text="false"
            :stroke-width="6"
            class="item-progress"
          />
        </div>
      </template>
      <el-empty v-else description="暂无统计数据" :image-size="80" />
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  items: {
    type: Array,
    default: () => []
  },
  height: {
    type: String,
    default: '400px'
  }
})

const maxCount = computed(() => {
  if (!props.items || props.items.length === 0) return 0
  return Math.max(...props.items.map(i => Number(i.count || 0)))
})

const getPercentage = (count) => {
  if (!maxCount.value) return 0
  return (Number(count) / maxCount.value) * 100
}

const formatNumber = (num) => {
  return Number(num || 0).toLocaleString()
}
</script>

<style scoped>
.error-top-list-card {
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

.list-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 5px;
}

.list-item {
  margin-bottom: 16px;
}

.list-item:last-child {
  margin-bottom: 0;
}

.item-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 13px;
}

.item-key {
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80%;
}

.item-count {
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono);
  font-weight: 500;
}

.item-progress :deep(.el-progress-bar__outer) {
  background-color: var(--el-fill-color-lighter);
}

.item-progress :deep(.el-progress-bar__inner) {
  background: linear-gradient(90deg, var(--el-color-primary), var(--el-color-success));
}

/* 滚动条样式 */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--el-border-color-lighter);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-placeholder);
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
