<template>
  <div class="php-pages">
    <!-- 顶部筛选与操作区 -->
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          class="node-select-wrapper"
        />
      </div>

      <div class="header-right">
        <el-input
          v-model="searchQuery"
          placeholder="搜索环境名称或镜像..."
          class="search-input"
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-button-group class="action-buttons">
          <el-button :icon="Refresh" @click="loadEnvironments" :loading="loading" title="刷新列表">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="createEnvironment">安装PHP</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- PHP 环境表格 -->
    <div class="table-container" v-loading="loading">
      <el-table :data="filteredEnvironments" style="width: 100%" border stripe>
        <el-table-column prop="name" label="名称" min-width="100" />
        <el-table-column prop="image" label="镜像" min-width="200" />
        <el-table-column prop="status" label="状态" width="170" align="center">
          <template #default="{ row }">
            <el-tag :type="row.state === 'running' ? 'success' : 'info'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdTime" label="创建时间" width="180" />
        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              link
              :type="row.state === 'running' ? 'danger' : 'success'"
              @click="toggleEnvironmentStatus(row)"
            >
              {{ row.state === 'running' ? '停止' : '启动' }}
            </el-button>
            <el-button link type="primary" @click="openSettings(row)">设置</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- PHP 环境设置区域 -->
    <PhpEnvironmentSettings
      v-if="selectedContainerName"
      :node-id="currentNodeId"
      :container-name="selectedContainerName"
      class="settings-container"
    />

    <!-- 安装 PHP 弹窗 -->
    <PhpEnvironmentInstallModal
      v-model="installModalVisible"
      :node-id="currentNodeId"
      @installed="loadEnvironments"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import PhpEnvironmentSettings from './php/PhpEnvironmentSettings.vue'
import PhpEnvironmentInstallModal from './php/PhpEnvironmentInstallModal.vue'

const currentNodeId = ref('')
const environmentList = ref([])
const searchQuery = ref('')
const loading = ref(false)
const selectedContainerName = ref('')
const installModalVisible = ref(false)

// 过滤后的环境列表
const filteredEnvironments = computed(() => {
  const phpPattern = /^php\d{2}$/i
  let environments = environmentList.value.filter((env) => phpPattern.test(env.name))

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    environments = environments.filter(
      (env) =>
        env.name.toLowerCase().includes(query) ||
        env.image.toLowerCase().includes(query),
    )
  }

  return environments
})

// API 定义
const dockerAPI = {
  async testConnection(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/test-connection`)
    return await response.json()
  },

  async getContainers(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/containers`)
    return await response.json()
  },

  async toggleContainer(nodeId, containerId, action) {
    const url = `/api/forward/${nodeId}/docker/containers/${containerId}/${action}`
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
    if (action === 'stop') {
      options.body = JSON.stringify({ timeout: 10 })
    }
    const response = await fetch(url, options)
    return await response.json()
  },
}

// 处理节点选择
const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  loadEnvironments()
}

// 加载环境列表
const loadEnvironments = async () => {
  if (!currentNodeId.value) return

  loading.value = true
  try {
    const connectionTest = await dockerAPI.testConnection(currentNodeId.value)
    if (!connectionTest.success) {
      throw new Error(connectionTest.message || 'Docker连接失败')
    }

    const response = await dockerAPI.getContainers(currentNodeId.value)
    if (response.success) {
      environmentList.value = (response.data || []).map((container) => ({
        containerId: container.containerId,
        name: container.name,
        image: container.image,
        status: container.status,
        state: container.state,
        createdTime: formatDate(container.created),
      }))
    } else {
      throw new Error(response.message || '获取环境列表失败')
    }
  } catch (err) {
    ElMessage.error(err.message || '加载环境失败')
    environmentList.value = []
  } finally {
    loading.value = false
  }
}

// 格式化日期
const formatDate = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 切换环境状态
const toggleEnvironmentStatus = async (env) => {
  const action = env.state === 'running' ? 'stop' : 'start'
  const actionText = env.state === 'running' ? '停止' : '启动'

  try {
    await ElMessageBox.confirm(
      `确定要${actionText}环境 "${env.name}" 吗？`,
      `${actionText}确认`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    const response = await dockerAPI.toggleContainer(currentNodeId.value, env.containerId, action)
    if (response.success) {
      ElMessage.success(`环境${actionText}成功`)
      loadEnvironments()
    } else {
      throw new Error(response.message || `${actionText}失败`)
    }
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '操作失败')
    }
  }
}

// 安装 PHP
const createEnvironment = () => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  installModalVisible.value = true
}

// 打开设置
const openSettings = (env) => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  selectedContainerName.value = env && env.name ? String(env.name) : ''
}
</script>

<style scoped>
.php-pages {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-bg-color-overlay);
  padding: 16px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.node-select-wrapper {
  width: 220px;
}

.search-input {
  width: 240px;
}

.table-container {
  background: var(--el-bg-color-overlay);
  padding: 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}


:deep(.el-table) {
  --el-table-header-bg-color: var(--el-fill-color-light);
}

/* 响应式 */
@media (max-width: 1000px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .header-left, .header-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .search-input {
    flex: 1;
  }
}
</style>
