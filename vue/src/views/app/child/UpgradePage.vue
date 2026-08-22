<template>
  <div class="upgrade-page">
    <!-- 顶部筛选与状态区 -->
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          @error="handleNodeError"
          class="node-select-wrapper"
        />
        <div class="store-hint">
          <el-icon><InfoFilled /></el-icon>
          <span>应用商店不会自动更新，请前往“设置”中点击“更新官方商店”。</span>
        </div>
      </div>

      <div class="header-right">
        <el-input
          v-model="searchQuery"
          placeholder="搜索容器名称或镜像..."
          class="search-input"
          clearable
          @keyup.enter="searchApps"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button :icon="Refresh" @click="loadData" :loading="loading">刷新</el-button>
      </div>
    </div>

    <!-- 应用列表 -->
    <div class="table-container" v-loading="loading" element-loading-text="加载应用版本信息中...">
      <el-table :data="filteredRows" style="width: 100%" border stripe>
        <el-table-column prop="name" label="名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="image" label="镜像" min-width="250" show-overflow-tooltip />
        <el-table-column prop="currentVersion" label="当前版本" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.currentVersion || '未知' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最新版本" width="150" align="center">
          <template #default="{ row }">
            <span v-if="row.latestAmbiguity" class="error-text">数据异常</span>
            <el-tag v-else-if="row.latestVersion" size="small" type="success">{{ row.latestVersion }}</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.canUpgrade"
              type="primary"
              size="small"
              @click="upgradeApp(row)"
            >
              升级
            </el-button>
            <span v-else-if="row.actionHint" class="action-hint">{{ row.actionHint }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <AppUpgradeModal
      v-if="showUpgradeModal"
      :nodeId="currentNodeId"
      :containerId="selectedContainerId"
      :containerName="selectedContainerName"
      :versions="selectedVersions"
      :currentImage="selectedImage"
      @close="showUpgradeModal = false"
      @submitted="onUpgradeSubmitted"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, InfoFilled } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import AppUpgradeModal from './modal/AppUpgradeModal.vue'

const searchQuery = ref('')
const currentNodeId = ref('')
const containerList = ref([])
const storeApps = ref([])

const dockerAPI = {
  async testConnection(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/test-connection`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  async getContainers(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/docker/containers`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
}

const loading = ref(false)

const handleNodeSelected = async (node) => {
  currentNodeId.value = node.id
  loading.value = true
  try {
    await loadData()
  } finally {
    loading.value = false
  }
}

const handleNodeError = (errorMsg) => {
  ElMessage({ message: `节点选择错误: ${errorMsg}`, type: 'error', duration: 5000, showClose: true })
  containerList.value = []
}

const fetchStore = async () => {
  try {
    const response = await fetch('/api/appstore/docker-store')
    if (!response.ok) {
      ElMessage({ message: `应用商店接口错误: HTTP ${response.status}` , type: 'error', duration: 5000, showClose: true })
      storeApps.value = []
      return
    }
    const result = await response.json()
    if (result && result.success) {
      const apps = Array.isArray(result.data?.apps) ? result.data.apps : []
      storeApps.value = apps
    } else {
      ElMessage({ message: `${result?.message || '应用商店接口错误'}` , type: 'error', duration: 5000, showClose: true })
      storeApps.value = []
    }
  } catch {
    ElMessage({ message: '应用商店接口调用失败' , type: 'error', duration: 5000, showClose: true })
    storeApps.value = []
  }
}

const loadContainers = async () => {
  if (!currentNodeId.value) return
  try {
    const connectionTest = await dockerAPI.testConnection(currentNodeId.value)
    if (!connectionTest.success) {
      ElMessage({ message: `Docker连接失败: ${connectionTest.message || '未知错误'}`, type: 'error', duration: 5000, showClose: true })
      throw new Error(connectionTest.message || 'Docker连接测试失败')
    }
    const response = await dockerAPI.getContainers(currentNodeId.value)
    if (!response.success) {
      ElMessage({ message: `获取容器列表失败: ${response.message || '未知错误'}`, type: 'error', duration: 5000, showClose: true })
      throw new Error(response.message || '获取容器列表失败')
    }
    containerList.value = (response.data || []).map((container) => ({
      containerId: container.containerId,
      name: container.name,
      image: container.image,
      state: container.state
    }))
  } catch (err) {
    containerList.value = []
    ElMessage({ message: `加载容器失败: ${err.message}` , type: 'error', duration: 5000, showClose: true })
    console.error('加载容器失败:', err)
  }
}

const loadData = async () => {
  await Promise.all([fetchStore(), loadContainers()])
}

const getTag = (image) => {
  if (!image) return ''
  const atIdx = image.indexOf('@')
  const clean = atIdx >= 0 ? image.slice(0, atIdx) : image
  const slashIdx = clean.lastIndexOf('/')
  const colonIdx = clean.lastIndexOf(':')
  if (colonIdx > slashIdx) return clean.slice(colonIdx + 1)
  return ''
}

const isSemver = (v) => {
  if (!v || typeof v !== 'string') return false
  return /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(v)
}

const compareSemver = (a, b) => {
  if (!isSemver(a) || !isSemver(b)) return 0
  const pa = a.split(/[+-]/)[0].split('.').map(n => parseInt(n, 10))
  const pb = b.split(/[+-]/)[0].split('.').map(n => parseInt(n, 10))
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

const latestVersionOfApp = (versions) => {
  const list = versions.map(v => v.version).filter(Boolean)
  const semvers = list.filter(isSemver)
  if (semvers.length === 0) return list[0] || ''
  return semvers.reduce((max, cur) => (compareSemver(cur, max) > 0 ? cur : max), semvers[0])
}

const hasLatestAmbiguity = (versions) => {
  const latestImages = versions.filter(v => typeof v.image === 'string' && getTag(v.image) === 'latest')
  const uniqueVersionSet = new Set(latestImages.map(v => v.version))
  return uniqueVersionSet.size > 1
}

const matchedRows = computed(() => {
  const rows = []
  for (const c of containerList.value) {
    let matched = null
    let appMeta = null
    for (const app of storeApps.value) {
      const hit = (app.versions || []).find(v => v.image === c.image)
      if (hit) { matched = hit; appMeta = app; break }
    }
    if (!matched) continue
    const latestVersion = latestVersionOfApp(appMeta.versions || [])
    const ambiguity = hasLatestAmbiguity(appMeta.versions || [])
    const tag = getTag(c.image)
    let canUpgrade = true
    let actionHint = ''
    if (tag === 'latest') canUpgrade = false
    if (ambiguity) canUpgrade = false
    if (tag === 'latest') actionHint = '不可升级'
    else if (ambiguity) actionHint = '数据异常，建议反馈'
    if (isSemver(matched.version) && isSemver(latestVersion)) {
      const cmp = compareSemver(matched.version, latestVersion)
      if (cmp >= 0 && canUpgrade) { canUpgrade = false; actionHint = '已是最新' }
    }
    rows.push({
      containerId: c.containerId,
      name: c.name,
      image: c.image,
      currentVersion: matched.version || '',
      latestVersion: latestVersion || '',
      latestAmbiguity: ambiguity,
      canUpgrade,
      actionHint,
      versions: Array.isArray(appMeta.versions) ? appMeta.versions : []
    })
  }
  return rows
})

const filteredRows = computed(() => {
  let list = matchedRows.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(r => r.name.toLowerCase().includes(q) || r.image.toLowerCase().includes(q))
  }
  return list
})

const searchApps = () => {}

const showUpgradeModal = ref(false)
const selectedContainerId = ref('')
const selectedContainerName = ref('')
const selectedVersions = ref([])
const selectedImage = ref('')

const upgradeApp = (row) => {
  if (!row.canUpgrade) {
    const tag = getTag(row.image)
    if (row.latestAmbiguity) {
      ElMessage({ message: '商店latest镜像映射多个版本，建议反馈开发者', type: 'warning' })
      return
    }
    if (tag === 'latest') {
      ElMessage({ message: '镜像为latest，不支持升级', type: 'warning' })
      return
    }
    ElMessage({ message: '已是最新版', type: 'info' })
    return
  }
  selectedContainerId.value = row.containerId
  selectedContainerName.value = row.name
  selectedVersions.value = Array.isArray(row.versions) ? row.versions : []
  selectedImage.value = row.image
  showUpgradeModal.value = true
}

const onUpgradeSubmitted = () => {
  ElMessage({ message: '升级任务已创建', type: 'success' })
}



onMounted(() => {})
</script>

<style scoped>
.upgrade-page {
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

.store-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: var(--el-border-radius-base);
  color: var(--el-color-warning);
  font-size: 13px;
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

.error-text {
  color: var(--el-color-danger);
  font-size: 12px;
}

.action-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
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

  .store-hint {
    width: 100%;
  }

  .search-input {
    flex: 1;
  }
}
</style>
