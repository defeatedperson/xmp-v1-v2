<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import SideMenu from './components/SideMenu.vue'
import FloatingMenuButton from './components/FloatingMenuButton.vue'
import FooterMenu from './components/FooterMenu.vue'
import ClipboardPopover from './components/ClipboardPopover.vue'

const route = useRoute()
const isMobile = ref(false)
const isMenuVisible = ref(false)

const showLayout = computed(() => !route.meta.hideLayout)
const hideClipboard = computed(() => route.meta.hideClipboard)

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
  if (!isMobile.value) {
    isMenuVisible.value = false
  }
}

const toggleMenu = () => {
  isMenuVisible.value = !isMenuVisible.value
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<template>
  <el-container class="app-wrapper">
    <!-- 桌面端侧边栏 -->
    <el-aside width="200px" class="hidden-xs-only side-aside" v-if="showLayout">
      <SideMenu />
    </el-aside>

    <!-- 移动端侧边栏 (抽屉) -->
    <el-drawer
      v-if="showLayout"
      v-model="isMenuVisible"
      direction="ltr"
      size="200px"
      :with-header="false"
      class="mobile-drawer"
    >
      <SideMenu @select="isMenuVisible = false" />
    </el-drawer>

    <el-container class="main-container">
      <el-main class="app-main">
        <div class="content-wrapper">
          <router-view v-slot="{ Component }">
            <transition name="fade-transform" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
          <FooterMenu v-if="showLayout" />
        </div>
      </el-main>
    </el-container>

    <!-- 移动端悬浮按钮 -->
    <FloatingMenuButton
      v-if="showLayout"
      :is-mobile="isMobile"
      :is-menu-visible="isMenuVisible"
      @toggle="toggleMenu"
    />

    <!-- 剪切板组件 -->
    <ClipboardPopover v-if="!hideClipboard" />
  </el-container>
</template>

<style>
.app-wrapper {
  height: 100vh;
  width: 100%;
  background-color: var(--el-bg-color-page);
}

.side-aside {
  background-color: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
}

/* 移动端抽屉样式 */
.mobile-drawer {
  background-color: var(--el-bg-color) !important;
}

.mobile-drawer .el-drawer__body {
  padding: 0;
  background-color: var(--el-bg-color);
}

.main-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-main {
  padding: 0;
  background-color: var(--el-bg-color-page);
  overflow-y: auto;
  overflow-x: hidden;
}

.content-wrapper {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

/* 页面切换动画 */
.fade-transform-enter-active,
.fade-transform-leave-active {
  transition: all 0.3s;
}

.fade-transform-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.fade-transform-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

/* 隐藏移动端滚动条 */
@media screen and (max-width: 768px) {
  .app-main {
    padding: 0;
  }
}
</style>
