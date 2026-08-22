<template>
  <el-card class="linux-commands-card" shadow="never">
    <template #header>
      <div class="card-header" @click="toggleCard">
        <span class="card-title">常用Linux命令</span>
        <i :class="['fas', isExpanded ? 'fa-chevron-up' : 'fa-chevron-down', 'toggle-icon']"></i>
      </div>
    </template>

    <div v-show="isExpanded" class="card-content">
      <div class="commands-grid">
        <div
          v-for="(category, index) in commands"
          :key="index"
          class="command-category"
        >
          <h4 class="category-title">{{ category.title }}</h4>
          <ul class="command-list">
            <li
              v-for="(command, cmdIndex) in category.items"
              :key="cmdIndex"
              class="command-item"
              @click="copyCommand(command)"
            >
              <div class="command-text">{{ command.cmd }}</div>
              <div class="command-desc">{{ command.desc }}</div>
              <i class="fas fa-copy copy-icon"></i>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const isExpanded = ref(false)

const toggleCard = () => {
  isExpanded.value = !isExpanded.value
}

const commands = [
  {
    title: '系统信息',
    items: [
      { cmd: 'uname -a', desc: '显示系统信息' },
      { cmd: 'cat /etc/os-release', desc: '显示操作系统信息' },
      { cmd: 'uptime', desc: '显示系统运行时间' },
      { cmd: 'df -h', desc: '显示磁盘空间使用情况' },
      { cmd: 'free -h', desc: '显示内存使用情况' }
    ]
  },
  {
    title: '文件操作',
    items: [
      { cmd: 'ls -la', desc: '列出详细文件信息' },
      { cmd: "find . -name '*.log'", desc: '查找.log文件' },
      { cmd: "grep 'error' /var/log/*.log", desc: '在日志中搜索错误' },
      { cmd: 'tar -czvf archive.tar.gz /path/', desc: '创建压缩包' },
      { cmd: 'chmod 755 filename', desc: '修改文件权限' }
    ]
  },
  {
    title: '进程管理',
    items: [
      { cmd: 'ps aux', desc: '显示所有进程' },
      { cmd: 'top', desc: '实时显示进程状态' },
      { cmd: 'kill -9 PID', desc: '强制终止进程' },
      { cmd: 'systemctl status service', desc: '查看服务状态' },
      { cmd: 'journalctl -u service', desc: '查看服务日志' }
    ]
  },
  {
    title: '星梦面板',
    items: [
      { cmd: 'bash <(curl -sSL https://dl.xmpanel.cn/sh/firewall.sh)', desc: '系统防火墙设置' },
      { cmd: '请勿在此终端执行“xmp更新命令“', desc: '这会导致出现意料之外的情况' }
    ]
  }
]

const copyCommand = (command) => {
  navigator.clipboard.writeText(command.cmd).then(() => {
    try { ElMessage.success(`已复制: ${command.cmd}`) } catch { void 0 }
  }).catch(err => {
    try { ElMessage.error(`复制失败: ${String(err)}`) } catch { void 0 }
  })
}
</script>

<style scoped>
.linux-commands-card {
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.card-title {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.toggle-icon {
  color: var(--el-text-color-secondary);
  transition: transform 0.3s ease;
}

.card-content {
  padding-top: 4px;
}

.commands-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.command-category {
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
  padding: 12px;
}

.category-title {
  color: var(--el-text-color-regular);
  font-size: 14px;
  margin: 0 0 10px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.command-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.command-item {
  padding: 8px 10px;
  border-radius: var(--el-border-radius-base);
  margin-bottom: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;
  display: flex;
  flex-direction: column;
}

.command-item:hover {
  background: var(--el-fill-color);
}

.command-text {
  color: var(--el-color-primary-light-3);
  font-family: monospace;
  font-size: 13px;
  margin-bottom: 4px;
}

.command-desc {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.copy-icon {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--el-text-color-secondary);
  opacity: 0;
  transition: opacity 0.2s;
}

.command-item:hover .copy-icon {
  opacity: 1;
}

@media (max-width: 768px) {
  .commands-grid {
    grid-template-columns: 1fr;
  }
}
</style>
