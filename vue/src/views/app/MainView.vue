<template>
  <div class="main-view-container">
    <!-- 顶部二级导航 -->
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />

    <!-- 内容区域 -->
    <div class="app-content">
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
import InstallPage from './child/InstallPage.vue'
import ManagePage from './child/ManagePage.vue'
import UpgradePage from './child/UpgradePage.vue'
import SettingsPage from './child/SettingsPage.vue'

// 顶部菜单项数据
const topMenuItems = ref([
  { id: 1, name: '安装', icon: 'fas fa-download', active: true },
  { id: 2, name: '管理', icon: 'fas fa-cogs', active: false },
  { id: 3, name: '升级', icon: 'fas fa-arrow-up', active: false },
  { id: 4, name: '设置', icon: 'fas fa-cog', active: false },
])

// 获取当前活动组件
const currentPageComponent = computed(() => {
  const activeItem = topMenuItems.value.find(item => item.active)
  switch (activeItem?.id) {
    case 1: return InstallPage
    case 2: return ManagePage
    case 3: return UpgradePage
    case 4: return SettingsPage
    default: return InstallPage
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

.app-content {
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
