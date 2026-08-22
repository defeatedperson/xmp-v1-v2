<template>
  <div class="top-menu">
    <div class="menu-container">
      <!-- 使用 el-tabs 代替按钮组，提供更标准、简洁的导航体验 -->
      <div class="sub-menu">
        <el-tabs
          v-model="activeTabId"
          class="custom-tabs"
        >
          <el-tab-pane
            v-for="item in menuItems"
            :key="item.id"
            :name="item.id"
          >
            <template #label>
              <div class="tab-label">
                <i :class="['sub-menu-icon', item.icon]" v-if="item.icon"></i>
                <span>{{ item.name }}</span>
              </div>
            </template>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 右侧操作区域 -->
      <div class="menu-actions">
        <slot name="extra"></slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 二级菜单项
  menuItems: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['menu-click'])

// 获取当前激活的标签 ID
const activeTabId = computed({
  get: () => {
    const activeItem = props.menuItems.find(item => item.active)
    return activeItem ? activeItem.id : null
  },
  set: (val) => {
    const item = props.menuItems.find(i => i.id === val)
    if (item) {
      emit('menu-click', item)
    }
  }
})
</script>

<style scoped>
.top-menu {
  width: 100%;
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  box-sizing: border-box;
}

.menu-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  min-height: 48px;
}

.sub-menu {
  flex: 1;
  min-width: 0;
  /* 移除 el-tabs 默认的底部边距 */
  margin-bottom: -1px;
}

:deep(.el-tabs__header) {
  margin: 0;
  border-bottom: none;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__item) {
  height: 48px;
  line-height: 48px;
  font-size: 14px;
  transition: all 0.3s;
  padding: 0 20px;
}

:deep(.el-tabs__item.is-active) {
  font-weight: 600;
}

:deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab-label i {
  font-size: 16px;
}

.menu-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-left: 20px;
}

/* 响应式调整 */
@media (max-width: 768px) {


  .menu-actions {
    justify-content: flex-end;
    padding: 8px 0;
    margin-left: 0;
  }
}
</style>
