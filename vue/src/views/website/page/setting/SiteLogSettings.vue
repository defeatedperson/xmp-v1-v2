<template>
  <div class="site-log-settings">
    <el-empty v-if="!props.site" description="请先选择站点" />

    <el-row v-else :gutter="10" class="settings-content">
      <!-- 卡片1：日志设置 -->
      <el-col :xs="24" :sm="24" :md="12" class="mb-5">
        <el-card class="settings-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="title">日志设置</span>
            </div>
          </template>

          <div class="card-body">
            <div class="setting-item mb-4">
              <div class="setting-info">
                <div class="setting-label">访问日志</div>
                <div class="setting-desc">开启后将记录站点访问日志</div>
              </div>
              <el-switch
                v-model="logSettings.accessLogEnabled"
                :disabled="loading"
                inline-prompt
                active-text="开"
                inactive-text="关"
              />
            </div>

            <div class="setting-item mb-5">
              <div class="setting-info">
                <div class="setting-label">错误日志</div>
                <div class="setting-desc">开启后将记录站点错误日志</div>
              </div>
              <el-switch
                v-model="logSettings.errorLogEnabled"
                :disabled="loading"
                inline-prompt
                active-text="开"
                inactive-text="关"
              />
            </div>

            <div class="card-actions">
              <el-button
                type="primary"
                :loading="loading"
                :disabled="!hasChanges"
                @click="saveSettings"
              >
                保存配置
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 卡片2：日志管理 -->
      <el-col :xs="24" :sm="24" :md="12" class="mb-5">
        <el-card class="settings-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="title">日志管理</span>
              <el-button
                link
                type="primary"
                :loading="loading"
                @click="loadLogFiles"
              >
                <el-icon class="mr-1"><Refresh /></el-icon>
                刷新列表
              </el-button>
            </div>
          </template>

          <div class="card-body">
            <!-- 今日日志 -->
            <div class="today-logs mb-5">
              <el-button
                class="today-log-btn"
                type="primary"
                plain
                @click="openTodayAccessLog"
              >
                <template #icon><el-icon><Document /></el-icon></template>
                今日访问日志
              </el-button>
              <el-button
                class="today-log-btn"
                type="warning"
                plain
                @click="openTodayErrorLog"
              >
                <template #icon><el-icon><Warning /></el-icon></template>
                累计错误日志
              </el-button>
            </div>

            <!-- 历史访问日志 -->
            <div class="history-logs-section">
              <div class="section-title">历史访问日志</div>
              <div class="log-list-container" v-loading="loading">
                <el-scrollbar max-height="320px">
                  <div v-if="logFiles.length === 0" class="log-empty">
                    <el-empty :image-size="60" description="暂无历史日志" />
                  </div>
                  <div v-else class="log-list">
                    <div
                      v-for="file in logFiles"
                      :key="file.name"
                      class="history-log-item"
                      @click="openLogFile(file)"
                    >
                      <div class="log-item-left">
                        <el-icon class="log-icon"><Document /></el-icon>
                        <span class="log-name">{{ formatDate(file.name) }}</span>
                      </div>
                      <div class="log-item-right">
                        <span class="log-size">{{ formatFileSize(file.size) }}</span>
                        <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                      </div>
                    </div>
                  </div>
                </el-scrollbar>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 日志查看弹窗 -->
    <LogViewModal
      :isVisible="showLogModal"
      :nodeId="props.nodeId"
      :site="props.site"
      :logType="currentLogType"
      :logFile="currentLogFile"
      @close="closeLogModal"
      @refresh="handleLogRefresh"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Document, Warning, ArrowRight } from '@element-plus/icons-vue'
import LogViewModal from './LogViewModal.vue'

const props = defineProps({
  site: {
    type: Object,
    default: null
  },
  nodeId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['refresh'])

const loading = ref(false)
const logFiles = ref([])

// 日志弹窗状态
const showLogModal = ref(false)
const currentLogType = ref('')
const currentLogFile = ref(null)

const logSettings = ref({
  accessLogEnabled: true,
  errorLogEnabled: true
})

const hasChanges = computed(() => {
  if (!props.site || !props.site.config) return false
  return (
    logSettings.value.accessLogEnabled !== (props.site.config.accessLogEnabled !== false) ||
    logSettings.value.errorLogEnabled !== (props.site.config.errorLogEnabled !== false)
  )
})

const initSettings = () => {
  if (props.site && props.site.config) {
    logSettings.value = {
      accessLogEnabled: props.site.config.accessLogEnabled !== false,
      errorLogEnabled: props.site.config.errorLogEnabled !== false
    }
  }
}

const saveSettings = async () => {
  if (!props.nodeId || !props.site) {
    ElMessage.error('节点ID或站点信息缺失')
    return
  }

  loading.value = true
  try {
    const domain = props.site.primaryDomain || props.site.id
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}`

    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accessLogEnabled: logSettings.value.accessLogEnabled,
        errorLogEnabled: logSettings.value.errorLogEnabled
      })
    })

    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }

    if (!resp.ok) {
      const msg = result && result.message ? result.message : `HTTP ${resp.status}`
      throw new Error(msg)
    }

    if (!result || !result.success) {
      const msg = result && result.message ? result.message : '保存失败'
      throw new Error(msg)
    }

    ElMessage.success('日志设置保存成功')
    emit('refresh')
  } catch (error) {
    console.error('保存日志设置失败:', error)
    ElMessage.error(error.message || '保存日志设置失败')
  } finally {
    loading.value = false
  }
}

const loadLogFiles = async () => {
  if (!props.nodeId || !props.site) return

  loading.value = true
  try {
    const domain = props.site.primaryDomain || props.site.id
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}/logs`

    const resp = await fetch(url)
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }

    if (!resp.ok) {
      const msg = result && result.message ? result.message : `HTTP ${resp.status}`
      throw new Error(msg)
    }

    if (!result || !result.success) {
      const msg = result && result.message ? result.message : '获取日志列表失败'
      throw new Error(msg)
    }

    logFiles.value = result.data?.files || []
  } catch (error) {
    console.error('获取日志列表失败:', error)
    if (error.message !== '日志目录不存在') {
      ElMessage.error(error.message || '获取日志列表失败')
    }
    logFiles.value = []
  } finally {
    loading.value = false
  }
}

const formatDate = (filename) => {
  if (!filename) return ''
  // 从文件名中提取日期，例如 "2026-01-01.log" -> "2026-01-01"
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : filename.replace('.log', '')
}

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const openTodayAccessLog = () => {
  currentLogType.value = 'today-access'
  currentLogFile.value = null
  showLogModal.value = true
}

const openTodayErrorLog = () => {
  currentLogType.value = 'today-error'
  currentLogFile.value = null
  showLogModal.value = true
}

const openLogFile = (file) => {
  currentLogType.value = 'history'
  currentLogFile.value = file
  showLogModal.value = true
}

watch(() => props.site, () => {
  initSettings()
  if (props.site && props.nodeId) {
    loadLogFiles()
  }
}, { immediate: true })

watch(() => props.nodeId, () => {
  if (props.site && props.nodeId) {
    loadLogFiles()
  }
})

onMounted(() => {
  if (props.site && props.nodeId) {
    loadLogFiles()
  }
})

// 关闭日志弹窗
const closeLogModal = () => {
  showLogModal.value = false
  currentLogType.value = ''
  currentLogFile.value = null
}

// 日志刷新后重新加载日志列表
const handleLogRefresh = () => {
  loadLogFiles()
  emit('refresh')
}
</script>

<style scoped>
.site-log-settings {
  margin-top: 0px;
}

.settings-content {
  padding: 4px;
}

.settings-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.settings-card :deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.settings-card :deep(.el-card__body) {
  padding: 20px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
}

.card-header .title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header .title::before {
  content: '';
  width: 3px;
  height: 14px;
  background: var(--el-color-primary);
  border-radius: 2px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.setting-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.card-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.today-logs {
  display: flex;
  gap: 12px;
}

.today-log-btn {
  flex: 1;
  height: 40px;
}

.section-title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.log-list-container {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-light);
  padding: 4px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-log-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-log-item:hover {
  background: var(--el-fill-color-darker);
}

.log-item-left, .log-item-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-icon {
  font-size: 16px;
  color: var(--el-text-color-secondary);
}

.log-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.log-size {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.arrow-icon {
  font-size: 14px;
  color: var(--el-text-color-placeholder);
  opacity: 0;
  transition: opacity 0.2s;
}

.history-log-item:hover .arrow-icon {
  opacity: 1;
}

.log-empty {
  padding: 20px 0;
}

.mb-4 {
  margin-bottom: 16px;
}

.mb-5 {
  margin-bottom: 20px;
}

.mr-1 {
  margin-right: 4px;
}

@media (max-width: 768px) {
  .card-header {
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
  }

  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .today-logs {
    flex-direction: column;
  }

  .today-log-btn {
    margin-left: 0 !important;
    width: 100%;
  }

  .card-actions {
    flex-direction: column;
  }

  .card-actions .el-button {
    margin-left: 0;
    width: 100%;
  }
}
</style>
