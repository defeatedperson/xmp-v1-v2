<template>
  <div class="main-view-container">
    <!-- 顶部二级导航 -->
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />

    <!-- 内容区域 -->
    <div class="website-content">
      <transition name="fade-transform" mode="out-in">
        <component
          :is="currentPageComponent"
          :initial-domain="selectedDomainForSettings"
          @open-site-settings="handleOpenSiteSettings"
        />
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import TopMenu from '@/components/TopMenu.vue'

// 引入子页面组件
import WebsitesPage from './page/WebsitesPage.vue'
import EnvironmentPage from './page/PhpPages.vue'
import NodeEnvironmentPage from './page/NodeEnvironmentPage.vue'
import SslCertificatesPage from './page/SslCertificatesPage.vue'
import OpSettingsPage from './page/SiteSettingsPage.vue'

// 顶部菜单项数据
const topMenuItems = ref([
  { id: 1, name: '网站', icon: 'fas fa-globe', active: true },
  { id: 2, name: 'PHP环境', icon: 'fab fa-php', active: false },
  { id: 5, name: 'Nodejs', icon: 'fab fa-node-js', active: false },
  { id: 3, name: 'SSL证书', icon: 'fas fa-lock', active: false },
  { id: 4, name: '站点设置', icon: 'fas fa-cog', active: false },
])

const selectedDomainForSettings = ref('')

// 获取当前活动组件
const currentPageComponent = computed(() => {
  const activeItem = topMenuItems.value.find(item => item.active)
  switch (activeItem?.id) {
    case 1: return WebsitesPage
    case 2: return EnvironmentPage
    case 5: return NodeEnvironmentPage
    case 3: return SslCertificatesPage
    case 4: return OpSettingsPage
    default: return WebsitesPage
  }
})

// 处理菜单点击
const handleTopMenuClick = (item) => {
  // 如果点击的不是站点设置，清空选中的域名
  if (item.id !== 4) {
    selectedDomainForSettings.value = ''
  }

  topMenuItems.value.forEach(menu => {
    menu.active = menu.id === item.id
  })
}

// 处理打开站点设置
const handleOpenSiteSettings = (domain) => {
  selectedDomainForSettings.value = domain || ''
  topMenuItems.value.forEach((menu) => {
    menu.active = menu.id === 4
  })
}
</script>

<style scoped>
.main-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.website-content {
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
