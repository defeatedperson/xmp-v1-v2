<template>
  <button
    v-if="isMobile"
    class="floating-menu-btn"
    :class="{ active: isMenuVisible }"
    @click="toggleMenu"
  >
    <span class="btn-icon">
      <i v-if="!isMenuVisible" class="fas fa-bars"></i>
      <i v-else class="fas fa-times"></i>
    </span>
  </button>
</template>

<script setup>
defineProps({
  // 是否为移动端
  isMobile: {
    type: Boolean,
    default: false,
  },
  // 菜单是否可见
  isMenuVisible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle'])

const toggleMenu = () => {
  emit('toggle')
}
</script>

<style scoped>
.floating-menu-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #3b82f6 100%);
  border: none;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  cursor: pointer;
  z-index: 2001; /* 确保在 el-drawer 之上或之下取决于需求，通常 el-drawer 是 2000+ */
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform: scale(1);
}

.floating-menu-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.6);
}

.floating-menu-btn:active {
  transform: scale(0.95);
}

.floating-menu-btn.active {
  background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
  box-shadow: 0 4px 12px rgba(244, 63, 94, 0.4);
}

.floating-menu-btn.active:hover {
  box-shadow: 0 6px 16px rgba(244, 63, 94, 0.6);
}

.btn-icon {
  color: white;
  font-size: 20px;
  transition: transform 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-menu-btn.active .btn-icon {
  transform: rotate(90deg);
}

/* 脉冲动画效果 */
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(99, 102, 241, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}

.floating-menu-btn:not(.active) {
  animation: pulse 2s infinite;
}
</style>
