<template>
  <div class="extensions-container" v-loading="loadingAvailable || loadingActive">
    <div class="extensions-header">
      <el-input
        v-model="search"
        placeholder="搜索扩展名称..."
        clearable
        class="search-input"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button :icon="Refresh" circle @click="reload" :loading="loadingAvailable || loadingActive" title="刷新列表" />
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <div class="table-wrapper">
      <el-table
        :data="filteredExtensions"
        style="width: 100%"
        height="100%"
        border
        stripe
        highlight-current-row
      >
        <el-table-column prop="name" label="扩展名称" min-width="150">
          <template #default="{ row }">
            <span class="ext-name">{{ row.name }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="mode" label="来源" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.mode }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.installed"
              :loading="busyKey === row.key"
              :disabled="loadingActive || loadingAvailable"
              @update:model-value="val => handleToggle(row, val)"
            />
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="暂无扩展数据" :image-size="100" />
        </template>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'

const props = defineProps({
  nodeId: { type: String, default: '' },
  containerName: { type: String, default: '' },
})

const available = ref([])
const activeNormalized = ref(new Set())
const loadingAvailable = ref(false)
const loadingActive = ref(false)
const error = ref('')
const busyKey = ref('')
const search = ref('')

const normalizeName = (name) => {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const getActiveAliases = (extName) => {
  const n = String(extName || '').toLowerCase()
  if (n === 'opcache') return ['opcache', 'zendopcache']
  return [normalizeName(n)]
}

const buildAvailableList = (raw) => {
  const list = Array.isArray(raw) ? raw : []
  const map = new Map()
  for (const item of list) {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const mode = typeof item?.mode === 'string' ? item.mode.trim().toLowerCase() : ''
    if (!name) continue
    if (mode !== 'pecl') continue
    const key = `${name.toLowerCase()}|${mode}`
    if (!map.has(key)) {
      map.set(key, { name, mode, key })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

const mergedExtensions = computed(() => {
  const list = available.value
  const act = activeNormalized.value
  return list.map((e) => {
    const aliases = getActiveAliases(e.name)
    const installed = aliases.some((a) => act.has(a))
    return { ...e, installed }
  })
})

const filteredExtensions = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = mergedExtensions.value
  if (q) {
    list = list.filter((e) => e.name.toLowerCase().includes(q))
  }
  return list
})

const loadAvailable = async () => {
  loadingAvailable.value = true
  try {
    const resp = await fetch('/api/appstore/php-versions')
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '加载扩展清单失败'
      throw new Error(msg)
    }
    const data = result.data || {}
    available.value = buildAvailableList(data.extensions)
  } finally {
    loadingAvailable.value = false
  }
}

const loadActive = async () => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId) throw new Error('请选择节点')
  if (!containerName) throw new Error('容器信息缺失')

  loadingActive.value = true
  try {
    const url = `/api/forward/${encodeURIComponent(
      nodeId,
    )}/php/extensions/active?containerName=${encodeURIComponent(containerName)}`
    const resp = await fetch(url)
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '获取已启用扩展失败'
      throw new Error(msg)
    }
    const resData = result.data || {}
    // 兼容不同的返回格式
    const data = (resData.modules || resData.zendModules) ? resData : (resData.data || {})
    const modules = Array.isArray(data.modules) ? data.modules : []
    const zendModules = Array.isArray(data.zendModules) ? data.zendModules : []
    const set = new Set()
    for (const m of modules) set.add(normalizeName(m))
    for (const m of zendModules) set.add(normalizeName(m))
    activeNormalized.value = set
  } finally {
    loadingActive.value = false
  }
}

const reload = async () => {
  try {
    error.value = ''
    await Promise.all([loadAvailable(), loadActive()])
  } catch (e) {
    error.value = String(e && e.message ? e.message : '加载失败')
  }
}

const installExt = async (ext) => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId) {
    error.value = '请选择节点'
    return
  }
  if (!containerName) {
    error.value = '容器信息缺失'
    return
  }
  busyKey.value = ext.key
  try {
    await ElMessageBox.confirm(`确定要启用扩展 "${ext.name}" 吗？`, '启用确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/extensions/install`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerName,
        extension: ext.name,
        mode: ext.mode,
      }),
    })
    const result = await resp.json().catch(() => null)
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '启用扩展失败'
      throw new Error(msg)
    }
    ElMessage.success(result.message || '扩展已启用并重启PHP')
    await reload()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(String(e && e.message ? e.message : '安装失败'))
    }
  } finally {
    busyKey.value = ''
  }
}

const disableExt = async (ext) => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId) {
    error.value = '请选择节点'
    return
  }
  if (!containerName) {
    error.value = '容器信息缺失'
    return
  }
  busyKey.value = ext.key
  try {
    await ElMessageBox.confirm(`确定要禁用扩展 "${ext.name}" 吗？`, '禁用确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/extensions/disable`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerName,
        extension: ext.name,
        mode: ext.mode,
      }),
    })
    const result = await resp.json().catch(() => null)
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '禁用扩展失败'
      throw new Error(msg)
    }
    ElMessage.success(result.message || '扩展已禁用并重启PHP')
    await reload()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(String(e && e.message ? e.message : '禁用失败'))
    }
  } finally {
    busyKey.value = ''
  }
}

const handleToggle = async (ext, newValue) => {
  if (busyKey.value) return
  if (newValue && !ext.installed) {
    await installExt(ext)
  } else if (!newValue && ext.installed) {
    await disableExt(ext)
  }
}

watch(
  () => [props.nodeId, props.containerName],
  async ([nodeId, containerName]) => {
    if (!nodeId || !containerName) {
      error.value = ''
      available.value = []
      activeNormalized.value = new Set()
      busyKey.value = ''
      return
    }
    search.value = ''
    await reload()
  },
  { immediate: true },
)
</script>

<style scoped>
.extensions-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.extensions-header {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}

.search-input {
  max-width: 300px;
}

.table-wrapper {
  flex: 1;
  min-height: 0;
}

.ext-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.mb-4 {
  margin-bottom: 16px;
}

:deep(.el-table__inner-wrapper::before) {
  display: none;
}
</style>


