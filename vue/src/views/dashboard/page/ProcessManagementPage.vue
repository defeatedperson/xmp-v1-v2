<template>
  <div class="process-management">
    <!-- 顶部筛选区域 -->
    <div class="filter-header">
      <div class="filter-left">
        <NodeSelector :node-type="1" @node-selected="onNodeSelected" />
        <el-input
          v-model="searchQuery"
          placeholder="搜索进程名或PID..."
          class="filter-item search-input"
          clearable
          :prefix-icon="Search"
          @keyup.enter="handleSearch"
        />
        <el-button
          type="primary"
          :icon="Search"
          @click="handleSearch"
          :loading="loading"
        >
          搜索
        </el-button>
      </div>
      <div class="filter-right">
        <div class="auto-refresh-box">
          <span class="label">自动刷新 (5s)</span>
          <el-switch
            v-model="autoRefresh"
            @change="handleAutoRefreshChange"
            :disabled="!currentNodeId"
          />
        </div>
        <el-button
          :icon="Refresh"
          @click="refreshProcesses"
          :loading="loading"
          :disabled="!currentNodeId"
        >
          刷新
        </el-button>
      </div>
    </div>

    <!-- 表格区域 -->
    <div class="table-container" v-loading="loading">
      <el-table
        :data="paginatedProcesses"
        style="width: 100%"
        border
        stripe
        size="small"
        @sort-change="handleSortChange"
      >
        <el-table-column prop="pid" label="PID" width="100" sortable="custom" />
        <el-table-column prop="name" label="进程名" min-width="150" show-overflow-tooltip sortable="custom" />
        <el-table-column prop="cpu" label="CPU (%)" width="120" sortable="custom">
          <template #default="{ row }">
            {{ row.cpu?.toFixed(2) || '0.00' }}
          </template>
        </el-table-column>
        <el-table-column prop="memory" label="内存 (%)" width="120" sortable="custom">
          <template #default="{ row }">
            {{ row.memory?.toFixed(2) || '0.00' }}
          </template>
        </el-table-column>
        <el-table-column prop="uid" label="用户" width="120" />
        <el-table-column prop="ppid" label="PPID" width="100" />
        <el-table-column prop="cmd" label="命令" min-width="300" show-overflow-tooltip />
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <div class="page-info">第 {{ currentPage }} / {{ Math.ceil(filteredCount / pageSize) || 1 }} 页</div>
        <el-pagination
          v-model:current-page="currentPage"
          :total="filteredCount"
          :page-size="pageSize"
          layout="total, prev, next"
          size="small"
          background
          @current-change="handleCurrentChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed,  onUnmounted, watch } from 'vue'
import { Search, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import NodeSelector from '@/components/NodeSelector.vue'

// 状态变量
const currentNodeId = ref('')
const processList = ref([])
const searchQuery = ref('')
const loading = ref(false)
const autoRefresh = ref(false)
const refreshTimer = ref(null)

// 排序与分页
const sortBy = ref('cpu')
const sortOrder = ref('descending') // element-plus 使用 ascending/descending
const currentPage = ref(1)
const pageSize = ref(15)

// 计算属性：过滤后的列表
const filteredProcesses = computed(() => {
  let list = [...processList.value]

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase().trim()
    list = list.filter(p =>
      p.name?.toLowerCase().includes(query) ||
      p.pid?.toString().includes(query) ||
      p.cmd?.toLowerCase().includes(query)
    )
  }

  // 排序
  list.sort((a, b) => {
    const field = sortBy.value
    let aVal = a[field]
    let bVal = b[field]

    if (field === 'pid' || field === 'ppid') {
      aVal = parseInt(aVal) || 0
      bVal = parseInt(bVal) || 0
    }

    if (sortOrder.value === 'ascending') {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })

  return list
})

const filteredCount = computed(() => filteredProcesses.value.length)

const paginatedProcesses = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredProcesses.value.slice(start, end)
})

// 节点选择
const onNodeSelected = (node) => {
  currentNodeId.value = node.id
  loadProcesses()
}

// 加载进程
const loadProcesses = async (isAuto = false) => {
  if (!currentNodeId.value) return
  if (!isAuto) loading.value = true

  try {
    const resp = await fetch(`/api/forward/${currentNodeId.value}/processes`)
    const result = await resp.json()

    if (!resp.ok || !result.success) {
      throw new Error(result.message || '获取进程列表失败')
    }

    processList.value = result.data?.processes || []

    if (!isAuto && processList.value.length === 0) {
      ElMessage.info('未找到任何进程')
    }
  } catch (err) {
    console.error('加载进程失败:', err)
    if (err.message.includes('仅支持Linux系统')) {
      ElMessage.warning('进程管理功能仅支持 Linux 系统')
    } else {
      ElMessage.error(`加载进程失败: ${err.message}`)
    }
    processList.value = []
    if (autoRefresh.value) {
      autoRefresh.value = false
    }
  } finally {
    if (!isAuto) loading.value = false
  }
}

// 交互操作
const handleSearch = () => {
  currentPage.value = 1
}

const refreshProcesses = () => {
  loadProcesses()
}

const handleSortChange = ({ prop, order }) => {
  if (prop && order) {
    sortBy.value = prop
    sortOrder.value = order
  } else {
    // 恢复默认排序
    sortBy.value = 'cpu'
    sortOrder.value = 'descending'
  }
}

const handleCurrentChange = (val) => {
  currentPage.value = val
}

// 自动刷新逻辑
const startAutoRefresh = () => {
  stopAutoRefresh()
  refreshTimer.value = setInterval(() => {
    if (currentNodeId.value && !loading.value) {
      loadProcesses(true)
    }
  }, 5000)
}

const stopAutoRefresh = () => {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
}

const handleAutoRefreshChange = (val) => {
  if (val) {
    startAutoRefresh()
    ElMessage.success('已开启自动刷新（5秒）')
  } else {
    stopAutoRefresh()
  }
}

// 监听
watch(searchQuery, () => {
  currentPage.value = 1
})

// 销毁
onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.process-management {
  padding: 0;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  background: var(--el-bg-color-overlay);
  padding: 16px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.filter-left, .filter-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 240px;
}

.auto-refresh-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
  padding-right: 16px;
  border-right: 1px solid var(--el-border-color-lighter);
}

.auto-refresh-box .label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.table-container {
  background: var(--el-bg-color-overlay);
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}

.page-info {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

:deep(.el-table) {
  --el-table-header-bg-color: var(--el-fill-color-light);
}

/* 响应式调整 */
@media (max-width: 768px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .filter-left, .filter-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .search-input {
    width: 100%;
  }

  .auto-refresh-box {
    border-right: none;
    margin-right: 0;
    padding-right: 0;
  }
}
</style>
