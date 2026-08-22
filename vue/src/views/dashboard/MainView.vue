<template>
  <div class="main-view-container">
    <!-- 顶部二级导航 -->
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />

    <!-- 内容区域 -->
    <div class="dashboard-content">
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
import OverviewPage from './page/OverviewPage.vue'
import ResourceMonitorPage from './page/ResourceMonitorPage.vue'
import XccProtectionPage from './page/XccProtectionPage.vue'
import WebChart from './page/WebChart.vue'
import WebError from './page/WebError.vue'
import ProcessManagementPage from './page/ProcessManagementPage.vue'

// 顶部菜单项数据
const topMenuItems = ref([
  { id: 1, name: '概览', icon: 'fas fa-chart-bar', active: true },
  { id: 2, name: '资源监控', icon: 'fas fa-microchip', active: false },
  { id: 3, name: 'XCC防护', icon: 'fas fa-shield-alt', active: false },
  { id: 4, name: '网站报表', icon: 'fas fa-chart-line', active: false },
  { id: 5, name: '错误报表', icon: 'fas fa-bug', active: false },
  { id: 6, name: '进程查看', icon: 'fas fa-list-alt', active: false },
])

// 获取当前活动组件
const currentPageComponent = computed(() => {
  const activeItem = topMenuItems.value.find(item => item.active)
  switch (activeItem?.id) {
    case 1: return OverviewPage
    case 2: return ResourceMonitorPage
    case 3: return XccProtectionPage
    case 4: return WebChart
    case 5: return WebError
    case 6: return ProcessManagementPage
    default: return OverviewPage
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

.dashboard-content {
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
