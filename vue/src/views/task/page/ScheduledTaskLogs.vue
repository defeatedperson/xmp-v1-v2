<template>
  <div class="scheduled-task-logs-page">
    <!-- 顶部筛选栏 -->
    <div class="page-header">
      <div class="header-left">
        <NodeSelector :node-type="1" @node-selected="handleNodeSelected" />
      </div>
      <div class="header-right">
        <el-select
          v-model="days"
          placeholder="时间范围"
          style="width: 140px"
          @change="fetchScheduleLogs"
          :disabled="!selectedNodeId"
        >
          <el-option
            v-for="opt in dayOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-button :icon="Refresh" circle @click="fetchScheduleLogs" :disabled="!selectedNodeId" />
      </div>
    </div>

    <!-- 提示信息 -->
    <el-alert
      title="仅显示最近的计划任务执行日志"
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

        <el-table-column prop="title" label="标题" min-width="150" show-overflow-tooltip />

        <el-table-column label="结果" min-width="150">
          <template #default="{ row }">
            <el-tag
              v-if="parseContentStatus(row.content)"
              :type="getStatusTag(row.content)"
              size="small"
              effect="plain"
            >
              {{ parseContentDetail(row.content) || '-' }}
            </el-tag>
            <span v-else>{{ parseContentDetail(row.content) || '-' }}</span>
          </template>
        </el-table-column>

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
          :page-sizes="[10, 20, 50, 100]"
          layout="total,  prev, pager, next"
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
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import LogViewModal from '@/components/LogViewModal.vue'

// 状态
const selectedNodeId = ref('')
const logs = ref([])
const loading = ref(false)
const days = ref(3)
const limit = ref(100)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(20)

// 弹窗状态
const showLogModal = ref(false)
const modalTitle = ref('')
const modalContent = ref('')

const dayOptions = [
  { label: '最近 1 天', value: 1 },
  { label: '最近 3 天', value: 3 },
  { label: '最近 7 天', value: 7 }
]

// 计算属性
const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return logs.value.slice(start, end)
})

const selectedDayLabel = computed(() => {
  const hit = dayOptions.find(x => x.value === days.value)
  return hit ? hit.label : '最近 3 天'
})

// 方法
const handleNodeSelected = (node) => {
  selectedNodeId.value = node.id
  fetchScheduleLogs()
}

const fetchScheduleLogs = async () => {
  if (!selectedNodeId.value) return
  loading.value = true
  try {
    const response = await fetch(
      `/api/forward/${selectedNodeId.value}/schedule/logs?days=${days.value}&limit=${limit.value}`
    )
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`)
    }
    const result = await response.json()
    if (result && result.success) {
      logs.value = Array.isArray(result.data) ? result.data : []
      currentPage.value = 1 // 重置分页
    } else {
      logs.value = []
    }
  } catch (error) {
    ElMessage.error(error.message || '获取日志失败')
    logs.value = []
  } finally {
    loading.value = false
  }
}

// 格式化与解析
const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString()
}

const getLogTypeTag = (type) => {
  const map = {
    info: 'info',
    error: 'danger',
    warning: 'warning',
    debug: 'info',
    schedule: ''
  }
  return map[type] || ''
}

const getLogTypeText = (type) => {
  const map = {
    info: '信息',
    error: '错误',
    warning: '警告',
    debug: '调试',
    schedule: '计划任务'
  }
  return map[type] || type
}

const parseContentDetail = (content) => {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content)
    return parsed.detail || ''
  } catch {
    return ''
  }
}

const parseContentStatus = (content) => {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content)
    return parsed.status || ''
  } catch {
    return ''
  }
}

const getStatusTag = (content) => {
  const status = parseContentStatus(content)
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  return 'info'
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
  const title = log.title || ''
  const id = log.id || ''
  const typeText = getLogTypeText(log.type)
  const timestamp = formatDate(log.timestamp)
  const detail = parseContentDetail(log.content)
  const status = parseContentStatus(log.content)
  const rawContent = log.content || '暂无详细内容'

  modalTitle.value = title ? `日志详情 - ${title}` : '日志详情'
  modalContent.value = `时间范围: ${selectedDayLabel.value}
ID: ${id}
类型: ${typeText}
标题: ${title}
状态: ${status || '未知'}
结果: ${detail || '无'}
时间: ${timestamp}
----------------------------------------
原始内容:
${rawContent}`

  showLogModal.value = true
}
</script>

<style scoped>
.scheduled-task-logs-page {
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
