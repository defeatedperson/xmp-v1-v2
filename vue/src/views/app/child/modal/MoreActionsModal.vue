<template>
  <Teleport to="body">
    <div class="modal-overlay">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <h2>新手指导</h2>
        <div class="header-buttons">
          <button class="close-button" @click="close">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="content-wrapper">
          <div class="info-section">
            <div class="section-header">
              <div class="info-icon">
                <i class="fas fa-lightbulb"></i>
              </div>
              <h3>服务连接指引</h3>
            </div>

            <ul class="guide-list">
              <li class="guide-item">
                <div class="item-icon"><i class="fas fa-globe"></i></div>
                <div class="item-content">
                  <div class="item-title">公网访问</div>
                  <p>在“应用管理”找到目标应用，点击“更多”，开启“允许公网访问”。随后使用“服务器地址:端口”访问。</p>
                </div>
              </li>
              <li class="guide-item">
                <div class="item-icon"><i class="fas fa-project-diagram"></i></div>
                <div class="item-content">
                  <div class="item-title">容器间访问</div>
                  <p>直接使用“容器名:端口”。例如 WordPress 连接 MySQL，在主机名处填入容器名（复制按钮点一下）获取的信息即可。</p>
                </div>
              </li>
              <li class="guide-item">
                <div class="item-icon"><i class="fas fa-network-wired"></i></div>
                <div class="item-content">
                  <div class="item-title">IP 访问</div>
                  <p>若不支持容器名，点击“查看 IP 地址”获取容器 IP，使用“IP:端口”访问。注意：容器重启后 IP 可能变化。</p>
                </div>
              </li>
            </ul>

            <div class="tips-box">
              <i class="fas fa-info-circle"></i>
              <span>更多高级容器操作请前往 <b>节点管理 - 容器页面</b>。</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <div class="action-row">
          <button class="btn primary" @click="goToNodeContainers">
            <i class="fas fa-server"></i>
            前往节点管理
          </button>
        </div>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useRouter } from 'vue-router'

const emit = defineEmits(['close'])
const router = useRouter()

const close = () => {
  emit('close')
}

const goToNodeContainers = () => {
  close()
  router.push('/nodes')
}
</script>

<style scoped>
@import '@/assets/styles/modal-common.css';

.modal-container {
  max-width: 500px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
}

.modal-body {
  padding: 0 24px;
  margin-top: -10px;
}

.content-wrapper {
  padding-bottom: 20px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-header {
  text-align: center;
  margin-bottom: 10px;
}

.info-icon {
  font-size: 32px;
  color: var(--el-color-warning);
  margin-bottom: 12px;
  display: inline-block;
  filter: drop-shadow(0 0 10px var(--el-color-warning-light-5));
}

.section-header h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 600;
}

.guide-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.guide-item {
  display: flex;
  gap: 16px;
  background: var(--el-fill-color-light);
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.3s ease;
}

.guide-item:hover {
  background: var(--el-fill-color);
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.item-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.item-content {
  flex: 1;
}

.item-title {
  color: var(--el-text-color-primary);
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 6px;
}

.item-content p {
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
}

.tips-box {
  margin-top: 8px;
  padding: 12px 16px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--el-color-warning);
  font-size: 13px;
}

.tips-box b {
  color: var(--el-color-warning-dark-2);
}

.modal-footer {
  padding: 20px 24px 24px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: center;
}

.btn {
  padding: 10px 32px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  transition: all 0.2s;
  border: none;
}

.btn.primary {
  background: var(--el-color-primary);
  color: white;
  box-shadow: var(--el-box-shadow-light);
}

.btn.primary:hover {
  background: var(--el-color-primary-light-3);
  transform: translateY(-1px);
  box-shadow: var(--el-box-shadow);
}
</style>
