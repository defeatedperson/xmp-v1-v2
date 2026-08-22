<template>
  <div class="set-main-view">
    <!-- Top Menu -->
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />

    <!-- Content Area -->
    <div class="set-content">
      <transition name="fade-transform" mode="out-in">
        <component :is="currentPageComponent" />
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import TopMenu from '@/components/TopMenu.vue'

// Import child page components
import AccountSetting from './page/AccountSetting.vue'
import S3Setting from './page/S3Setting.vue'
import SecuritySetting from './page/SecuritySetting.vue'

// Top menu items
const topMenuItems = ref([
  { id: 'account', name: '账号设置', icon: 'fas fa-user', active: true },
  { id: 'security', name: '安全设置', icon: 'fas fa-shield-alt', active: false },
  { id: 's3', name: '对象存储', icon: 'fas fa-cloud', active: false },
])

// Get current active component
const currentPageComponent = computed(() => {
  const activeItem = topMenuItems.value.find(item => item.active)
  switch (activeItem?.id) {
    case 'account': return AccountSetting
    case 'security': return SecuritySetting
    case 's3': return S3Setting
    default: return AccountSetting
  }
})

// Handle menu click
const handleTopMenuClick = (item) => {
  topMenuItems.value.forEach(menu => {
    menu.active = menu.id === item.id
  })
}
</script>

<style scoped>
.set-main-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.set-content {
  flex: 1;
  padding: 10px;
  overflow: hidden;
  overflow-y: auto;
}

/* Page transition animation */
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
