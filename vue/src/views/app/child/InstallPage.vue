<template>
  <div class="install-page">

    <!-- 顶部筛选与操作区 -->
    <div class="filter-header">
      <div class="header-left">
        <el-select v-model="selectedStore" class="store-select" @change="handleStoreChange">
          <el-option label="官方商店" value="official" />
          <el-option label="自定义商店" value="custom" />
        </el-select>
        <el-select v-model="selectedType" placeholder="全部类型" clearable class="type-select">
          <el-option
            v-for="type in typeList"
            :key="type.id"
            :label="type.name"
            :value="type.id"
          />
        </el-select>
      </div>

      <div class="header-right">
        <el-input
          v-model="searchQuery"
          placeholder="搜索应用名称..."
          class="search-input"
          clearable
          @keyup.enter="searchApps"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-button-group>
          <el-button :icon="Refresh" @click="handleRefresh">刷新</el-button>
          <el-button type="success" :icon="Tools" @click="openInstaller">安装器</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 应用商店更新提示 -->
    <el-alert
      title="应用商店不会自动更新，请前往“设置”当中点击“更新官方商店”按钮，更新商店应用。"
      type="warning"
      :closable="false"
      show-icon
      class="store-alert"
    />

    <!-- 应用表格 -->
    <div class="table-container">
      <el-table :data="paginatedApps" style="width: 100%" border stripe>
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column label="类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ getTypeName(row.typeId) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="250" show-overflow-tooltip />
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="installApp(row)">安装</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container" v-if="totalPages > 1">
        <div class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</div>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="itemsPerPage"
          :total="filteredApps.length"
          layout="total, prev, next"
          size="small"
          background
        />
      </div>
    </div>

    <!-- 弹窗组件 -->
    <InstallerModal v-if="showInstaller" @close="showInstaller = false" @submit="onInstallerSubmit" />
    <AppStoreInstallModal v-if="showAppInstall" :app="selectedApp" @close="showAppInstall = false" @submit="onAppStoreSubmit" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Tools } from '@element-plus/icons-vue'
import InstallerModal from './modal/InstallerModal.vue'
import AppStoreInstallModal from './modal/AppStoreInstallModal.vue'

// 定义响应式数据
const currentPage = ref(1)
const itemsPerPage = ref(10)
const searchQuery = ref('')

const typeList = ref([])

// 默认选中全部类型
const selectedType = ref('')

// 默认选中官方商店
const selectedStore = ref('official')

const allApps = ref([])

const getTypeName = (typeId) => {
  const t = typeList.value.find(item => String(item.id) === String(typeId))
  return t ? t.name : '未知类型'
}

// 计算过滤后的应用数据
const filteredApps = computed(() => {
  let filtered = allApps.value
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        (app.description || '').toLowerCase().includes(query),
    )
  }
  if (selectedType.value) {
    filtered = filtered.filter((app) => (app.typeId || '') === selectedType.value)
  }
  return filtered
})

// 计算当前页应用数据
const paginatedApps = computed(() => {
  const startIndex = (currentPage.value - 1) * itemsPerPage.value
  const endIndex = startIndex + itemsPerPage.value
  return filteredApps.value.slice(startIndex, endIndex)
})

// 计算总页数
const totalPages = computed(() => {
  return Math.ceil(filteredApps.value.length / itemsPerPage.value)
})

// 搜索功能
const searchApps = () => {
  currentPage.value = 1
}

const showAppInstall = ref(false)
const selectedApp = ref(null)
const installApp = (app) => {
  selectedApp.value = app
  showAppInstall.value = true
}

// 刷新应用列表
const handleRefresh = async () => {
  await fetchStore(true)
}

// 切换商店
const handleStoreChange = async () => {
  await fetchStore(true)
}

// 打开安装器
const showInstaller = ref(false)
const openInstaller = () => { showInstaller.value = true }
const onInstallerSubmit = (config) => { console.log('installer config', config); showInstaller.value = false }
const onAppStoreSubmit = (payload) => { console.log('appstore install', payload); showAppInstall.value = false }

const fetchStore = async (isManual = false) => {
  try {
    const apiUrl = selectedStore.value === 'official'
      ? '/api/appstore/docker-store'
      : '/api/appstore/custom-store'
    const response = await fetch(apiUrl)
    const result = await response.json()
    if (result && result.success) {
      typeList.value = Array.isArray(result.data?.types) ? result.data.types : []
      const apps = Array.isArray(result.data?.apps) ? result.data.apps : []
      allApps.value = apps.map((app, idx) => ({ id: idx + 1, ...app }))
      currentPage.value = 1
      if (isManual) {
        ElMessage.success('应用列表已更新')
      }
    } else {
      typeList.value = []
      allApps.value = []
      if (selectedStore.value === 'custom' && result?.message?.includes('custom-store.json 不存在')) {
        ElMessage.warning('未设置自定义商店')
      } else {
        const storeName = selectedStore.value === 'official' ? '官方商店' : '自定义商店'
        ElMessage.error(`获取${storeName}数据失败`)
      }
    }
  } catch {
    typeList.value = []
    allApps.value = []
    ElMessage.error('刷新应用列表失败，请检查网络连接')
  }
}

onMounted(() => {
  fetchStore()
})
</script>

<style scoped>
.install-page {
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

.store-select, .type-select {
  width: 160px;
}

.search-input {
  width: 240px;
}

.store-alert {
  margin-bottom: 0px;
  border-radius: var(--el-border-radius-base);
}

.table-container {
  background: var(--el-bg-color-overlay);
  padding: 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.pagination-container {
  margin-top: 20px;
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
