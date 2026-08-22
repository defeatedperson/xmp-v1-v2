<template>
  <div class="main-view-container">
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />

    <div class="ssh-content">
      <transition name="fade-transform" mode="out-in">
        <component :is="currentPageComponent" />
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import TopMenu from '@/components/TopMenu.vue'
import TerminalPage from './page/TerminalPage.vue'
import SettingsPage from './page/SettingsPage.vue'

const topMenuItems = ref([
  { id: 1, name: '终端', icon: 'fas fa-terminal', active: true },
  { id: 2, name: '设置', icon: 'fas fa-cog', active: false },
])

const currentPageComponent = computed(() => {
  const activeItem = topMenuItems.value.find(item => item.active)
  switch (activeItem?.id) {
    case 1: return TerminalPage
    case 2: return SettingsPage
    default: return TerminalPage
  }
})

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

.ssh-content {
  flex: 1;
  padding: 10px;
}
</style>
