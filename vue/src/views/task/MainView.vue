<template>
  <div class="main-view-container">
    <!-- 顶部二级导航 -->
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />

    <!-- 内容区域 -->
    <div class="task-content">
      <transition name="fade-transform" mode="out-in">
        <component :is="currentPageComponent" />
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import TopMenu from '@/components/TopMenu.vue'

// 引入子页面组件
import QueueTasks from './page/QueueTasks.vue'
import ScheduledTasks from './page/ScheduledTasks.vue'
import ScheduledTaskLogs from './page/ScheduledTaskLogs.vue'

// 顶部菜单项数据
const topMenuItems = ref([
  { id: 'queue', name: '任务队列', icon: 'fas fa-tasks', active: true },
  { id: 'scheduled', name: '计划任务', icon: 'fas fa-calendar-alt', active: false },
  { id: 'scheduled-log', name: '计划日志', icon: 'fas fa-history', active: false },
])

// 获取当前活动组件
const currentPageComponent = computed(() => {
  const activeItem = topMenuItems.value.find(item => item.active)
  switch (activeItem?.id) {
    case 'queue': return QueueTasks
    case 'scheduled': return ScheduledTasks
    case 'scheduled-log': return ScheduledTaskLogs
    default: return QueueTasks
  }
})

// 处理菜单点击
const handleTopMenuClick = (item) => {
  topMenuItems.value.forEach(menu => {
    menu.active = menu.id === item.id
  })
}
</script>

<style scoped>
.main-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.task-content {
  flex: 1;
  padding: 10px;
}

/* 页面切换动画 */
.fade-transform-enter-active,
.fade-transform-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-transform-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.fade-transform-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
