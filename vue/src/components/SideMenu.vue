<template>
  <div class="side-menu-container">
    <div class="menu-header">
      <img src="/img/logo.png" alt="logo" class="menu-logo" />
    </div>

    <el-scrollbar>
      <el-menu
        :default-active="activeMenu"
        class="el-menu-vertical"
        :router="true"
        background-color="transparent"
        @select="handleSelect"
      >
        <!-- 上半部分菜单 -->
        <el-menu-item v-for="item in upperMenuItems" :key="item.id" :index="item.route">
          <i :class="['menu-icon', item.icon]"></i>
          <template #title>{{ item.name }}</template>
        </el-menu-item>

        <div class="menu-divider"></div>

        <!-- 下半部分菜单 -->
        <el-menu-item v-for="item in lowerMenuItems" :key="item.id" :index="item.route">
          <i :class="['menu-icon', item.icon]"></i>
          <template #title>{{ item.name }}</template>
        </el-menu-item>
      </el-menu>
    </el-scrollbar>

    <div class="logout-section">
      <el-button class="logout-btn" type="danger" plain @click="handleLogout">
        <i class="fas fa-sign-out-alt"></i>
        <span class="logout-text">退出登录</span>
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()

const emit = defineEmits(['select'])

const activeMenu = computed(() => route.path)

const handleSelect = () => {
  emit('select')
}

const upperMenuItems = ref([
  { id: 1, name: '数据大屏', route: '/dashboard', icon: 'fas fa-chart-bar' },
  { id: 2, name: '网站管理', route: '/website', icon: 'fas fa-globe' },
  { id: 3, name: '数据库', route: '/database', icon: 'fas fa-database' },
  { id: 4, name: '文件管理', route: '/file', icon: 'fas fa-folder' },
  { id: 5, name: '节点管理', route: '/node', icon: 'fas fa-server' },
  { id: 6, name: 'XCC防护', route: '/xcapp', icon: 'fas fa-shield-alt' },
  { id: 7, name: '应用商店', route: '/app', icon: 'fas fa-store' },
])

const lowerMenuItems = ref([
  { id: 11, name: 'SSH终端', route: '/ssh', icon: 'fas fa-terminal' },
  { id: 8, name: '任务中心', route: '/tasks', icon: 'fas fa-tasks' },
  { id: 9, name: '日志中心', route: '/logs', icon: 'fas fa-file-alt' },
  { id: 10, name: '安全设置', route: '/set', icon: 'fas fa-cog' },
])

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出登录', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    // 调用退出登录API
    const response = await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include', // 包含cookie
    })

    // 检查响应状态
    if (!response.ok) {
      throw new Error('退出登录请求失败')
    }

    // 跳转到登录页
    router.push('/login')
  } catch (error) {
    // 用户点击取消或出现其他错误
    if (error !== 'cancel' && error !== 'close') {
      console.error('退出登录请求失败:', error)
    }
  }
}
</script>

<style scoped>
.side-menu-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
}

.menu-header {
  padding: 15px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.menu-logo {
  height: 45px;
  width: auto;
  object-fit: contain;
}

.el-menu-vertical {
  border-right: none;
}

.menu-icon {
  margin-right: 12px;
  width: 20px;
  text-align: center;
  font-size: 16px;
  color: inherit;
}

.menu-divider {
  height: 1px;
  background: var(--el-border-color-lighter);
  margin: 12px 20px;
  opacity: 0.6;
}

.logout-section {
  padding: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.logout-btn {
  width: 100%;
  height: 40px;
  border-radius: var(--el-border-radius-base);
  font-weight: 500;
}

.logout-text {
  font-size: 14px;
}


</style>
