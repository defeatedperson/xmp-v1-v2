<template>
  <el-card class="todo-matters-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="title">待办事项</span>
        <el-button type="primary" size="small" @click="handleOpenAdd">
          <i class="fas fa-plus"></i>
          <span style="margin-left: 4px">新增待办</span>
        </el-button>
      </div>
    </template>

    <!-- 预警提示 -->
    <div v-if="overdueCount > 0 || dueSoonCount > 0" class="alert-container">
      <el-alert
        :type="overdueCount > 0 ? 'error' : 'warning'"
        :closable="false"
        show-icon
      >
        <template #title>
          <span class="alert-text">
            <span v-if="overdueCount > 0">存在 {{ overdueCount }} 条已过期事项</span>
            <span v-if="overdueCount > 0 && dueSoonCount > 0">，</span>
            <span v-if="dueSoonCount > 0">存在 {{ dueSoonCount }} 条 24 小时内到期事项</span>
          </span>
        </template>
      </el-alert>
    </div>

    <!-- 事项列表 -->
    <div class="matters-list" v-loading="loading">
      <template v-if="matters.length > 0">
        <div
          v-for="item in matters"
          :key="item.id"
          class="matter-item"
          :class="getDeadlineState(item)"
          @click="handleOpenView(item)"
        >
          <div class="matter-content">
            <div class="matter-title">
              {{ item.title }}
              <el-tag v-if="item.isUrgent" size="small" type="danger" effect="dark" class="urgent-tag">
                紧急
              </el-tag>
            </div>
            <div class="matter-meta">
              <span class="time">{{ formatTime(item.time) }}</span>
              <span v-if="getDeadlineLabel(item)" class="deadline-label" :class="getDeadlineState(item)">
                {{ getDeadlineLabel(item) }}
              </span>
            </div>
          </div>
          <div class="matter-actions">
            <el-button-group>
              <el-button size="small" circle @click.stop="handleOpenEdit(item)">
                <i class="fas fa-edit"></i>
              </el-button>
              <el-button size="small" circle type="danger" @click.stop="confirmDelete(item)">
                <i class="fas fa-trash"></i>
              </el-button>
            </el-button-group>
          </div>
        </div>
      </template>
      <div v-else class="no-data">
        <el-empty description="暂无待办事项" :image-size="60" />
      </div>
    </div>

    <!-- 弹窗组件 -->
    <MatterModal
      v-model="modalVisible"
      :mode="modalMode"
      :initial-data="currentMatter"
      @save="handleSave"
    />
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MatterModal from './modal/MatterModal.vue'

const matters = ref([])
const etag = ref('')
const loading = ref(false)
const MAX_ITEMS = 6
const DUE_SOON_MS = 24 * 60 * 60 * 1000

const modalVisible = ref(false)
const modalMode = ref('add')
const currentMatter = ref(null)
const nowMs = ref(Date.now())
let nowTimer = null

// 计算过期和即将过期
const overdueCount = computed(() => matters.value.filter(x => getDeadlineState(x) === 'overdue').length)
const dueSoonCount = computed(() => matters.value.filter(x => getDeadlineState(x) === 'due-soon').length)

function getDeadlineState(item) {
  const ms = Number(item.time)
  if (!ms) return 'normal'
  if (ms < nowMs.value) return 'overdue'
  if (ms - nowMs.value <= DUE_SOON_MS) return 'due-soon'
  return 'normal'
}

function getDeadlineLabel(item) {
  const state = getDeadlineState(item)
  if (state === 'overdue') return '已过期'
  if (state === 'due-soon') return '即将到期'
  return ''
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(Number(t))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}

async function loadMatters() {
  loading.value = true
  try {
    const res = await fetch('/api/matters')
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`)
    matters.value = Array.isArray(data.data) ? data.data : []
    etag.value = res.headers.get('etag') || ''
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function saveAll(newMatters) {
  try {
    const res = await fetch('/api/matters', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(etag.value ? { 'If-Match': etag.value } : {})
      },
      body: JSON.stringify(newMatters)
    })

    if (res.status === 412) {
      ElMessage.warning('内容已变更，已重新加载')
      await loadMatters()
      return false
    }

    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`)

    etag.value = res.headers.get('etag') || ''
    matters.value = newMatters
    return true
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
    return false
  }
}

const handleOpenAdd = () => {
  if (matters.value.length >= MAX_ITEMS) {
    ElMessage.error(`最多只能添加 ${MAX_ITEMS} 条待办事项`)
    return
  }
  modalMode.value = 'add'
  currentMatter.value = {}
  modalVisible.value = true
}

const handleOpenView = (item) => {
  modalMode.value = 'view'
  currentMatter.value = { ...item }
  modalVisible.value = true
}

const handleOpenEdit = (item) => {
  modalMode.value = 'edit'
  currentMatter.value = { ...item }
  modalVisible.value = true
}

const handleSave = async (payload) => {
  let newMatters = [...matters.value]
  if (modalMode.value === 'add') {
    newMatters.unshift(payload)
  } else {
    const idx = newMatters.findIndex(x => x.id === payload.id)
    if (idx !== -1) newMatters[idx] = payload
  }

  const ok = await saveAll(newMatters)
  if (ok) {
    ElMessage.success(modalMode.value === 'add' ? '新增成功' : '修改成功')
  }
}

const confirmDelete = async (item) => {
  try {
    await ElMessageBox.confirm(`确定要删除事项 "${item.title}" 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const newMatters = matters.value.filter(x => x.id !== item.id)
    const ok = await saveAll(newMatters)
    if (ok) {
      ElMessage.success('删除成功')
    }
  } catch {
    // 取消删除
  }
}

onMounted(() => {
  loadMatters()
  nowTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 60000)
})

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer)
})
</script>

<style scoped>
.todo-matters-card {
  margin-top: -15px;
  border-radius: var(--el-border-radius-base);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header .title {
  font-weight: bold;
}

.alert-container {
  margin-bottom: 16px;
}

.alert-text {
  font-size: 13px;
}

.matters-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.matter-item {
  padding: 12px 16px;
  background-color: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
  border-left: 4px solid var(--el-border-color);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid var(--el-border-color-lighter);
}

.matter-item:hover {
  background-color: var(--el-fill-color);
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.matter-item.overdue {
  border-left-color: var(--el-color-danger);
  background-color: rgba(var(--el-color-danger-rgb), 0.05);
}

.matter-item.due-soon {
  border-left-color: var(--el-color-warning);
  background-color: rgba(var(--el-color-warning-rgb), 0.05);
}

.matter-content {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.matter-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.urgent-tag {
  margin-left: 8px;
  flex-shrink: 0;
}

.matter-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.deadline-label {
  font-weight: bold;
}

.deadline-label.overdue {
  color: var(--el-color-danger);
}

.deadline-label.due-soon {
  color: var(--el-color-warning);
}

.matter-actions {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.matter-item:hover .matter-actions {
  opacity: 1;
}

.no-data {
  grid-column: 1 / -1;
  padding: 20px 0;
}
</style>
