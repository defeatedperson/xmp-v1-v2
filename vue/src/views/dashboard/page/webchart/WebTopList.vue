<template>
  <el-card class="web-top-list-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="title">{{ title }}</span>
      </div>
    </template>

    <div class="list-container custom-scrollbar" v-loading="loading">
      <el-empty v-if="items.length === 0 && !loading" description="暂无排行数据" :image-size="60" />

      <div v-else class="list-item" v-for="(item, index) in items" :key="index">
        <div class="item-info">
          <div class="item-left">
            <span class="rank-num" :class="{ 'top-3': index < 3 }">{{ index + 1 }}</span>
            <el-tooltip :content="item.key" placement="top" :show-after="500">
              <span class="item-key">{{ item.key }}</span>
            </el-tooltip>
          </div>
          <span class="item-count">{{ formatNumber(item.count) }}</span>
        </div>

        <el-progress
          :percentage="getPercentage(item.count)"
          :show-text="false"
          :stroke-width="6"
          class="item-progress"
        />
      </div>
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
  loading: {
    type: Boolean,
    default: false
  }
})

const maxCount = computed(() => {
  if (!props.items.length) return 0
  return Math.max(...props.items.map((i) => Number(i.count)))
})

const getPercentage = (count) => {
  if (!maxCount.value) return 0
  return (Number(count) / maxCount.value) * 100
}

const formatNumber = (num) => {
  return Number(num).toLocaleString()
}
</script>

<style scoped>
.web-top-list-card {
  height: 100%;
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
  padding: 5px 0;
  max-height: 450px;
}

.list-item {
  margin-bottom: 16px;
  padding: 0 5px;
}

.list-item:last-child {
  margin-bottom: 5px;
}

.item-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.item-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.rank-num {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  flex-shrink: 0;
}

.rank-num.top-3 {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-weight: bold;
}

.item-key {
  font-size: 13px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-count {
  font-size: 13px;
  font-family: var(--el-font-family-mono);
  color: var(--el-text-color-secondary);
  margin-left: 10px;
  flex-shrink: 0;
}

.item-progress {
  width: 100%;
}

:deep(.el-progress-bar__inner) {
  background: linear-gradient(90deg, var(--el-color-primary-light-3), var(--el-color-primary));
}

:deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 15px;
}

:deep(.el-card__header) {
  padding: 12px 15px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* 滚动条样式 */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--el-border-color-darker);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-placeholder);
}
</style>
