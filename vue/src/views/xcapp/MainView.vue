<template>
  <div class="main-view-container">
    <TopMenu :menu-items="topMenuItems" @menu-click="handleTopMenuClick" />
    <div class="xcapp-content">
      <transition name="fade-transform" mode="out-in">
        <component
          :is="currentPageComponent"
          :config="config"
          :nodes="nodes"
          :nodes-loading="nodesLoading"
          :initial-data="domainToEdit"
          :is-edit="editingIndex > -1"
          @add-domain="onAddDomain"
          @edit-domain="onEditDomain"
          @delete-domain="onDeleteDomain"
          @refresh-nodes="fetchNodes"
          @save="onSaveDomain"
          @cancel="onCancelDomainEdit"
          @save-acl="onSaveAcl"
          @save-acme="onSaveAcme"
          class="page-component"
          :key="currentView"
        />
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TopMenu from '@/components/TopMenu.vue'
import XcappOverview from './page/XcappOverview.vue'
import XcappDomainEdit from './page/XcappDomainEdit.vue'
import XcappAcl from './page/XcappAcl.vue'
import XcappSsl from './page/XcappSsl.vue'

const config = ref({ domains: [], acl: { whitelist: [], blacklist: [] }, acme_upstream: '' })
const nodes = ref([])
const nodesLoading = ref(false)
const domainToEdit = ref({})
const editingIndex = ref(-1)
const currentView = ref('overview')

const topMenuItems = ref([
  { id: 'overview', name: '概览', icon: 'fas fa-chart-pie', active: true },
  { id: 'acl', name: '黑白名单', icon: 'fas fa-shield-alt', active: false },
  { id: 'ssl', name: 'SSL设置', icon: 'fas fa-lock', active: false }
])

const currentPageComponent = computed(() => {
  switch (currentView.value) {
    case 'overview': return XcappOverview
    case 'acl': return XcappAcl
    case 'ssl': return XcappSsl
    case 'domain-edit': return XcappDomainEdit
    default: return XcappOverview
  }
})

const updateMenuState = (activeId) => {
  topMenuItems.value.forEach(item => {
    item.active = item.id === activeId
  })
}

const handleTopMenuClick = (item) => {
  if (item.id === 'overview' || item.id === 'acl' || item.id === 'ssl') {
    currentView.value = item.id
  }
  updateMenuState(item.id)
}

const fetchConfig = async () => {
  try {
    const resp = await fetch('/api/xcc/json')
    const result = await resp.json()
    if (result.success) {
      let data = result.data
      if (typeof data === 'string') {
        try { data = JSON.parse(data) } catch { data = {} }
      }
      config.value = data || { domains: [], acl: { whitelist: [], blacklist: [] } }
    } else {
      ElMessage.error(result.message || '获取配置失败')
    }
  } catch (e) {
    ElMessage.error('加载配置异常: ' + e.message)
  }
}

const fetchNodes = async () => {
  try {
    nodesLoading.value = true
    const resp = await fetch('/api/node/type')
    const result = await resp.json()
    if (result.success && Array.isArray(result.data)) {
      nodes.value = result.data.filter(n => String(n.type) === '3').map(n => ({ id: String(n.id) }))
    }
  } catch (e) {
    console.error(e)
  } finally {
    nodesLoading.value = false
  }
}

const saveFullConfig = async () => {
  try {
    const resp = await fetch('/api/xcc/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.value)
    })
    const result = await resp.json()
    if (result.success) {
      ElMessage.success('配置已保存')
      fetchConfig()
    } else {
      ElMessage.error(result.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存异常: ' + e.message)
  }
}

const onAddDomain = () => {
  domainToEdit.value = {}
  editingIndex.value = -1
  currentView.value = 'domain-edit'
  updateMenuState('overview')
}

const onEditDomain = (index) => {
  if (config.value.domains && config.value.domains[index]) {
    domainToEdit.value = { ...config.value.domains[index] }
    editingIndex.value = index
    currentView.value = 'domain-edit'
    updateMenuState('overview')
  }
}

const onDeleteDomain = async (index) => {
  try {
    await ElMessageBox.confirm('确定要删除这个域名配置吗？', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    if (config.value.domains) {
      config.value.domains.splice(index, 1)
      saveFullConfig()
    }
  } catch {
    ElMessage.info('删除操作已取消')
  }
}

const onSaveDomain = (domainData) => {
  if (!config.value.domains) config.value.domains = []
  if (editingIndex.value > -1) {
    config.value.domains[editingIndex.value] = domainData
  } else {
    config.value.domains.push(domainData)
  }
  saveFullConfig().then(() => {
    currentView.value = 'overview'
  })
}

const onCancelDomainEdit = () => {
  currentView.value = 'overview'
}

const onSaveAcl = (aclData) => {
  if (!config.value.acl) config.value.acl = { whitelist: [], blacklist: [] }
  config.value.acl.whitelist = aclData.whitelist
  config.value.acl.blacklist = aclData.blacklist
  saveFullConfig()
}

const onSaveAcme = (upstream) => {
  config.value.acme_upstream = upstream
  saveFullConfig()
}

onMounted(() => {
  fetchConfig()
  fetchNodes()
})
</script>

<style scoped>
.main-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.xcapp-content {
  flex: 1;
  padding: 10px;
}
</style>
