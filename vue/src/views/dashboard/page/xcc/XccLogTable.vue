<template>
  <div class="xcc-log-table-card">
    <div class="card-header">
      <div class="header-left">
        <h3 class="card-title">最近日志</h3>
        <el-tag size="small" type="info" effect="plain" class="notice-tag">
          最多显示最近300条记录
        </el-tag>
      </div>
      <div class="header-right">
        <el-radio-group v-model="sortOrder" size="small" @change="handleSortChange">
          <el-radio-button value="DESC">新到旧</el-radio-button>
          <el-radio-button value="ASC">旧到新</el-radio-button>
        </el-radio-group>
        <el-button
          :icon="Refresh"
          circle
          size="small"
          :loading="loading"
          @click="fetchLogs"
          title="刷新日志"
        />
      </div>
    </div>

    <div class="table-container">
      <el-table
        v-loading="loading"
        :data="paginatedLogs"
        style="width: 100%"
        border
        stripe
        size="small"
      >
        <el-table-column label="时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column label="级别" width="100">
          <template #default="{ row }">
            <el-tag :type="getLogLevelType(row.level)" size="small">
              {{ row.level.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="消息" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.message }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <div class="page-info">第 {{ currentPage }} / {{ Math.ceil(logs.length / pageSize) || 1 }} 页</div>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="logs.length"
          layout="total, prev, next"
          size="small"
          background
        />
      </div>
    </div>

    <LogViewModal
      v-model:visible="modalVisible"
      :title="modalTitle"
      :content="modalContent"
      @close="modalVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LogViewModal from '@/components/LogViewModal.vue'

const props = defineProps({
  nodeId: {
    type: String,
    default: ''
  }
})

const logs = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const sortOrder = ref('DESC')

const modalVisible = ref(false)
const modalTitle = ref('')
const modalContent = ref('')

// 获取分页后的日志
const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return logs.value.slice(start, end)
})

// 格式化时间
const formatTime = (ts) => {
  if (!ts) return '-'
  const date = new Date(ts * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 获取日志级别对应的 Tag 类型
const getLogLevelType = (level) => {
  const map = {
    info: 'info',
    success: 'success',
    warn: 'warning',
    warning: 'warning',
    error: 'danger',
    debug: 'info'
  }
  return map[level.toLowerCase()] || 'info'
}

// 获取日志数据
const fetchLogs = async () => {
  if (!props.nodeId) {
    logs.value = []
    return
  }

  loading.value = true
  try {
    const response = await fetch(`/api/forward/${props.nodeId}/admin/events/recent`)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const rawData = await response.json()
    const dataArray = Array.isArray(rawData) ? rawData : []
    logs.value = dataArray.map((log, index) => {
      let message = ''
      let detailsObj = {}

      if (log.details) {
        try {
          detailsObj = JSON.parse(log.details)
          message = detailsObj.message || detailsObj.event || JSON.stringify(detailsObj)
        } catch {
          message = log.details
        }
      }

      return {
        id: log.id || `log-${index}`,
        timestamp: log.ts || Date.now() / 1000,
        message: message,
        level: convertLevel(log.type),
        raw: { ...log, detailsParsed: detailsObj }
      }
    })
    sortLogs()
    currentPage.value = 1
  } catch (err) {
    console.error('Fetch Logs Error:', err)
    ElMessage.error(err.message || '获取日志失败')
    logs.value = []
  } finally {
    loading.value = false
  }
}

// 转换中文级别为英文级别
const convertLevel = (level) => {
  if (!level) return 'info'
  const levelMap = {
    '信息': 'info',
    '警告': 'warning',
    '错误': 'error',
    '调试': 'debug',
    '成功': 'success'
  }
  return levelMap[level] || level.toLowerCase()
}

// 排序日志
const sortLogs = () => {
  logs.value.sort((a, b) => {
    return sortOrder.value === 'ASC'
      ? a.timestamp - b.timestamp
      : b.timestamp - a.timestamp
  })
}

const handleSortChange = () => {
  sortLogs()
  currentPage.value = 1
}

// 查看详情
const viewDetail = (log) => {
  modalTitle.value = `日志详情 - ${log.level.toUpperCase()}`
  modalContent.value = `时间: ${formatTime(log.timestamp)}\n级别: ${log.level}\n消息: ${log.message}\n\n原始数据:\n${JSON.stringify(log.raw, null, 2)}`
  modalVisible.value = true
}

// 监听节点 ID 变化
watch(() => props.nodeId, () => {
  fetchLogs()
}, { immediate: true })

onMounted(() => {
  if (props.nodeId) {
    fetchLogs()
  }
})
</script>

<style scoped>
.xcc-log-table-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  padding: 16px;
  margin-top: 0px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.notice-tag {
  font-size: 11px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
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
</style>
