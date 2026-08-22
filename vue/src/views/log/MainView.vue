<template>
  <div class="log-main-view">
    <!-- 顶部二级导航 -->
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />

    <!-- 内容区域 -->
    <div class="log-content">
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
import SystemLogs from './page/SystemLogs.vue'
import NodeLogs from './page/NodeLogs.vue'
import DaemonLogs from './page/DaemonLogs.vue'
import WebsiteLogs from './page/WebsiteLogs.vue'

// 顶部菜单项数据
const topMenuItems = ref([
  { id: 'system', name: '主控日志', icon: 'fas fa-server', active: true },
  { id: 'website', name: '网站日志', icon: 'fas fa-globe', active: false },
  { id: 'node', name: '节点日志', icon: 'fas fa-network-wired', active: false },
  { id: 'daemon', name: '守护日志', icon: 'fas fa-shield-alt', active: false },
])

// 获取当前活动组件
const currentPageComponent = computed(() => {
  const activeItem = topMenuItems.value.find(item => item.active)
  switch (activeItem?.id) {
    case 'system': return SystemLogs
    case 'website': return WebsiteLogs
    case 'node': return NodeLogs
    case 'daemon': return DaemonLogs
    default: return SystemLogs
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
.log-main-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.log-content {
  flex: 1;
  padding: 10px;
  overflow: hidden;
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
