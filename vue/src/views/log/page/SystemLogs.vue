<template>
  <div class="system-logs-page">
    <!-- 顶部筛选栏 -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">主控日志</h2>
      </div>
      <div class="header-right">
        <el-select
          v-model="selectedDayOffset"
          placeholder="时间范围"
          style="width: 140px"
          @change="fetchLogs"
        >
          <el-option
            v-for="opt in dayOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-button :icon="Refresh" circle @click="fetchLogs" />
      </div>
    </div>

    <!-- 提示信息 -->
    <el-alert
      title="系统日志按天查看，自动保存近7天日志"
      type="info"
      show-icon
      :closable="false"
      class="tips-alert"
    />

    <!-- 日志表格 -->
    <div class="table-container">
      <el-table
        :data="paginatedLogs"
        style="width: 100%"
        v-loading="loading"
        stripe
        border
      >
        <el-table-column prop="id" label="ID" width="180" show-overflow-tooltip />

        <el-table-column prop="type" label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getLogTypeTag(row.type)" size="small" effect="light">
              {{ getLogTypeText(row.type) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />

        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.timestamp) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewLog(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          layout="total, prev, pager, next"
          :total="logs.length"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </div>

    <!-- 日志详情弹窗 -->
    <LogViewModal
      v-model:visible="showLogModal"
      :title="modalTitle"
      :content="modalContent"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import LogViewModal from '@/components/LogViewModal.vue'

// 状态
const logs = ref([])
const loading = ref(false)
const selectedDayOffset = ref(0)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(20)

// 弹窗状态
const showLogModal = ref(false)
const modalTitle = ref('')
const modalContent = ref('')

const dayOptions = [
  { label: '今天', value: 0 },
  { label: '昨天', value: -1 },
  { label: '前天', value: -2 },
  { label: '3天前', value: -3 },
  { label: '4天前', value: -4 },
  { label: '5天前', value: -5 },
  { label: '6天前', value: -6 },
]

// 计算属性
const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return logs.value.slice(start, end)
})

// 方法
const fetchLogs = async () => {
  loading.value = true
  try {
    const response = await fetch(`/api/logs?d=${selectedDayOffset.value}`)
    const result = await response.json()
    if (result.success) {
      logs.value = Array.isArray(result.data) ? result.data : []
      currentPage.value = 1
    } else {
      ElMessage.error(result.message || '获取日志失败')
      logs.value = []
    }
  } catch {
    ElMessage.error('获取日志失败')
    logs.value = []
  } finally {
    loading.value = false
  }
}

// 格式化
const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString()
}

const getLogTypeTag = (type) => {
  const map = {
    info: 'info',
    error: 'danger',
    warning: 'warning',
    debug: 'info'
  }
  return map[type] || 'info'
}

const getLogTypeText = (type) => {
  const map = {
    info: '信息',
    error: '错误',
    warning: '警告',
    debug: '调试'
  }
  return map[type] || type
}

// 分页处理
const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1
}

const handleCurrentChange = (val) => {
  currentPage.value = val
}

// 查看详情
const viewLog = (log) => {
  modalTitle.value = `日志详情 - ${log.title}`
  modalContent.value = `ID: ${log.id}
类型: ${getLogTypeText(log.type)}
标题: ${log.title}
时间: ${formatDate(log.timestamp)}
----------------------------------------
内容:
${log.content || '暂无详细内容'}`

  showLogModal.value = true
}

onMounted(() => {
  fetchLogs()
})
</script>

<style scoped>
.system-logs-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tips-alert {
  margin-bottom: 0;
}

.table-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 16px;
  overflow: hidden;
}

.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
</style>
