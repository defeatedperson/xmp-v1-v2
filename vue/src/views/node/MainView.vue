<template>
  <div class="main-view-container">
    <!-- 顶部二级导航 -->
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />

    <!-- 内容区域 -->
    <div class="node-content">
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
import NodeListPage from './page/NodeListPage.vue'
import ContainerManagePage from './page/ContainerManagePage.vue'
import ContainerImageManagePage from './page/ContainerImageManagePage.vue'
import NetworkManagePage from './page/NetworkManagePage.vue'
import VolumeManagePage from './page/VolumeManagePage.vue'

// 顶部菜单项数据
const topMenuItems = ref([
  { id: 1, name: '节点', icon: 'fas fa-server', active: true },
  { id: 2, name: '容器', icon: 'fas fa-box', active: false },
  { id: 3, name: '镜像', icon: 'fas fa-compact-disc', active: false },
  { id: 4, name: '网络', icon: 'fas fa-network-wired', active: false },
  { id: 5, name: '存储卷', icon: 'fas fa-hdd', active: false },
])

// 获取当前活动组件
const currentPageComponent = computed(() => {
  const activeItem = topMenuItems.value.find(item => item.active)
  switch (activeItem?.id) {
    case 1: return NodeListPage
    case 2: return ContainerManagePage
    case 3: return ContainerImageManagePage
    case 4: return NetworkManagePage
    case 5: return VolumeManagePage
    default: return NodeListPage
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

.node-content {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
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
