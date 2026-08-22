<template>
  <footer class="footer">
    <div class="footer-content">
      <!-- 左侧版权声明 -->
      <div class="left-section">
        <div class="copyright">© {{ currentYear }} 云阶星幕工作室 All rights reserved.</div>
      </div>

      <!-- 右侧链接、版本 -->
      <div class="right-section">
        <div class="links">
          <el-link href="https://xmpanel.cn/version" target="_blank" underline="never">获取更新</el-link>
          <el-link href="https://xmpanel.cn/wiki/welcome" target="_blank" underline="never">文档</el-link>
          <el-link href="https://xmpanel.cn" target="_blank" underline="never">官网</el-link>
          <el-link href="https://xmpanel.cn/terms/usage" target="_blank" underline="never">使用协议</el-link>
        </div>
        <div class="version">v2.0.1</div>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { ref } from 'vue'

const currentYear = ref(new Date().getFullYear())
</script>

<style scoped>
.footer {
  background-color: var(--el-bg-color);
  padding: 12px 0;
  border-top: 1px solid var(--el-border-color-light);
  width: 100%;
  box-sizing: border-box;
  margin-top: auto;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 auto;
  padding: 0 20px;
}

.left-section {
  flex: 1;
}

.copyright {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 20px;
}

.links {
  display: flex;
  gap: 12px;
}

.links .el-link {
  font-size: 14px;
  font-weight: normal;
  color: var(--el-text-color-regular);
}

.links .el-link:hover {
  color: var(--el-color-primary);
}

.version {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  white-space: nowrap;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .footer-content {
    justify-content: center;
    text-align: center;
  }

  .left-section {
    flex: none;
  }

  .right-section {
    display: none;
  }
}

@media (max-width: 480px) {
  .footer {
    padding: 10px 0;
  }

  .footer-content {
    padding: 0 15px;
    justify-content: center;
  }

  .right-section {
    display: none;
  }

  .copyright {
    font-size: 13px;
  }
}
</style>
