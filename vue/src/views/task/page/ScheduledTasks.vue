<template>
  <div class="scheduled-tasks-page">
    <!-- 顶部操作栏 -->
    <div class="page-header">
      <div class="header-left">
        <NodeSelector :node-type="1" @node-selected="handleNodeSelected" />
      </div>
      <div class="header-right">
        <el-switch
          v-model="planEnabled"
          active-text="已开启"
          inactive-text="已关闭"
          inline-prompt
          style="margin-right: 16px"
          :disabled="!selectedNodeId"
          @change="togglePlanEnabled"
        />
        <el-button-group>
          <el-button type="primary" :icon="check" @click="handleSaveClick" :disabled="!selectedNodeId">保存计划</el-button>
          <el-button type="success" :icon="VideoPlay" @click="handleOpenTest" :disabled="!selectedNodeId">测试任务</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 提示区域 -->
    <el-alert
      title="每个时间槽最长执行 2 小时，超时的任务块会被强制终止"
      type="info"
      show-icon
      :closable="false"
      class="tips-alert"
    />

    <!-- 时间轴区域 -->
    <div class="timeline-wrapper">
      <div class="timeline-container">
        <!-- 左侧固定时间轴 -->
        <div class="timeline-sidebar">
          <div v-for="slot in timeSlots" :key="slot.hour" class="sidebar-slot">
            <div class="time-label">{{ slot.label }}</div>
            <el-button
              circle
              size="small"
              type="primary"
              :icon="Plus"
              @click="addTask(slot.hour)"
              title="添加任务"
            />
          </div>
        </div>

        <!-- 右侧任务区域 -->
        <div class="timeline-content">
          <div
            v-for="slot in timeSlots"
            :key="slot.hour"
            class="content-row"
            @dragover.prevent
            @drop="onDropRow($event, slot.hour)"
          >
            <div
              v-for="(task, index) in getTasksByHour(slot.hour)"
              :key="task.id"
              class="task-card"
              :class="getTaskTypeClass(task.type)"
              draggable="true"
              @dragstart="onDragStart($event, task)"
              @drop.stop="onDropTask($event, task)"
              @dragover.prevent
            >
              <div class="task-header">
                <span class="task-name" :title="task.name">
                  <el-tag size="small" effect="dark" :type="getTaskTypeTag(task.type)">{{ getTaskTypeAbbr(task.type) }}</el-tag>
                  <span class="name-text">{{ task.name }}</span>
                </span>
                <div class="task-actions">
                  <el-button link size="small" :icon="Setting" @click.stop="openSettings(task)" />
                  <el-button link size="small" type="danger" :icon="Delete" @click.stop="deleteTask(task.id)" />
                </div>
              </div>
              <div class="task-meta">
                <span class="seq">#{{ index + 1 }}</span>
                <span class="copies" v-if="task.target">{{ task.target }}</span>
              </div>
            </div>

            <!-- 空槽位提示 -->
            <div v-if="getTasksByHour(slot.hour).length === 0" class="empty-slot-hint">
              <el-icon><Plus /></el-icon> 拖拽或点击左侧添加
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 弹窗组件 -->
    <TaskEditorModal
      v-model:visible="showTaskModal"
      :mode="modalMode"
      :task="editingTask"
      :node-id="selectedNodeId"
      @submit="handleTaskSubmit"
    />

    <TestScheduleModal
      v-model:visible="showTestModal"
      :slot-label="getSlotLabelByHour(getCurrentSlotHour())"
      :node-id="selectedNodeId"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Setting, Delete, VideoPlay } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import TaskEditorModal from './plan/TaskEditorModal.vue'
import TestScheduleModal from './plan/TestScheduleModal.vue'

// 状态
const selectedNodeId = ref('')
const planEnabled = ref(false)
const rawSlots = ref({})
const tasks = ref([])

// 弹窗控制
const showTaskModal = ref(false)
const modalMode = ref('create')
const editingTask = ref(null)
const editingHour = ref(0)
const showTestModal = ref(false)

const MAX_TASKS_PER_SLOT = 5

// 时间槽定义
const timeSlots = Array.from({ length: 12 }, (_, i) => {
  const hour = i * 2
  return {
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`
  }
})

// 数据获取
const api = {
  getPlan: async (nodeId) => {
    const res = await fetch(`/api/forward/${nodeId}/schedule/plan`)
    return await res.json()
  },
  savePlan: async (nodeId, payload) => {
    const res = await fetch(`/api/forward/${nodeId}/schedule/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return await res.json()
  }
}

const handleNodeSelected = (node) => {
  selectedNodeId.value = node.id
  fetchPlan()
}

const fetchPlan = async () => {
  if (!selectedNodeId.value) return
  try {
    const res = await api.getPlan(selectedNodeId.value)
    if (res.success) {
      normalizePlanData(res.data || {})
    } else {
      ElMessage.error(res.message || '获取计划任务失败')
    }
  } catch {
    ElMessage.error('网络错误')
  }
}

const normalizePlanData = (plan) => {
  planEnabled.value = plan.enabled !== false // 默认为 true
  rawSlots.value = plan.slots || {}

  const mapped = []
  for (const slot of timeSlots) {
    const key = String(slot.hour)
    const list = Array.isArray(rawSlots.value[key]) ? rawSlots.value[key] : []

    list.forEach(item => {
      if (!item.id && !item.name) return
      mapped.push({
        ...item,
        id: String(item.id),
        hour: slot.hour
      })
    })
  }
  tasks.value = mapped
}

// 核心逻辑：保存
const buildSlotsPayload = () => {
  const result = {}
  timeSlots.forEach(slot => {
    result[String(slot.hour)] = []
  })

  // 按照当前视图中的顺序构建
  tasks.value.forEach(task => {
    const key = String(task.hour)
    if (!result[key]) result[key] = []

    // 构建精简对象，只保留后端需要的字段
    result[key].push({
      id: task.id,
      name: task.name,
      type: task.type,
      target: task.target,
      localCopies: task.localCopies,
      remoteProfileId: task.remoteProfileId,
      remoteCopies: task.remoteCopies
    })
  })

  return result
}

const savePlan = async (silent = false) => {
  if (!selectedNodeId.value) return

  const payload = {
    version: 1,
    enabled: planEnabled.value,
    slots: buildSlotsPayload()
  }

  try {
    const res = await api.savePlan(selectedNodeId.value, payload)
    if (res.success) {
      if (!silent) ElMessage.success('保存成功')
      normalizePlanData(res.data || {})
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch {
    ElMessage.error('保存失败：网络错误')
  }
}

const handleSaveClick = () => {
  ElMessageBox.confirm('确定要保存当前计划任务配置吗？', '保存确认', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    savePlan()
  })
}

const togglePlanEnabled = () => {
  // 开关变化时自动保存
  savePlan(true)
}

// 任务管理
const addTask = (hour) => {
  if (getTasksByHour(hour).length >= MAX_TASKS_PER_SLOT) {
    ElMessage.warning(`每个时间槽最多只能添加 ${MAX_TASKS_PER_SLOT} 个任务`)
    return
  }

  editingHour.value = hour
  editingTask.value = {
    id: `task-${Date.now()}`,
    name: `任务-${tasks.value.length + 1}`,
    type: 'website',
    localCopies: 7,
    remoteCopies: 1
  }
  modalMode.value = 'create'
  showTaskModal.value = true
}

const openSettings = (task) => {
  editingHour.value = task.hour
  editingTask.value = { ...task }
  modalMode.value = 'edit'
  showTaskModal.value = true
}

const deleteTask = (id) => {
  const index = tasks.value.findIndex(t => t.id === id)
  if (index !== -1) {
    tasks.value.splice(index, 1)
    // ElMessage.success('已移除任务，请记得保存')
  }
}

const handleTaskSubmit = (payload) => {
  const taskIndex = tasks.value.findIndex(t => t.id === payload.id)

  if (taskIndex === -1) {
    // 新增
    tasks.value.push({
      ...payload,
      hour: editingHour.value
    })
  } else {
    // 更新
    const existing = tasks.value[taskIndex]
    tasks.value[taskIndex] = {
      ...existing,
      ...payload
    }
  }
  showTaskModal.value = false
}

// 拖拽逻辑
let draggedTask = null

const onDragStart = (e, task) => {
  draggedTask = task
  e.dataTransfer.effectAllowed = 'move'
  e.target.style.opacity = '0.5'
}

const onDropTask = (e, targetTask) => {
  resetStyles()
  if (!draggedTask || draggedTask.id === targetTask.id) return

  const targetHour = targetTask.hour
  if (draggedTask.hour !== targetHour && getTasksByHour(targetHour).length >= MAX_TASKS_PER_SLOT) {
    ElMessage.warning('目标时间槽已满')
    return
  }

  // 移动逻辑
  const fromIndex = tasks.value.findIndex(t => t.id === draggedTask.id)
  const [movedItem] = tasks.value.splice(fromIndex, 1)
  movedItem.hour = targetHour

  const toIndex = tasks.value.findIndex(t => t.id === targetTask.id)
  tasks.value.splice(toIndex, 0, movedItem)

  draggedTask = null
}

const onDropRow = (e, targetHour) => {
  resetStyles()
  if (!draggedTask) return

  if (draggedTask.hour !== targetHour && getTasksByHour(targetHour).length >= MAX_TASKS_PER_SLOT) {
    ElMessage.warning('目标时间槽已满')
    return
  }

  const fromIndex = tasks.value.findIndex(t => t.id === draggedTask.id)
  const [movedItem] = tasks.value.splice(fromIndex, 1)
  movedItem.hour = targetHour

  tasks.value.push(movedItem)
  draggedTask = null
}

const resetStyles = () => {
  document.querySelectorAll('.task-card').forEach(el => el.style.opacity = '1')
}

// 辅助方法
const getTasksByHour = (hour) => tasks.value.filter(t => t.hour === hour)

const getCurrentSlotHour = () => {
  const h = new Date().getHours()
  return Math.floor(h / 2) * 2
}

const getSlotLabelByHour = (hour) => {
  const target = timeSlots.find(s => s.hour === hour)
  return target ? target.label : `${String(hour).padStart(2, '0')}:00`
}

const handleOpenTest = () => {
  showTestModal.value = true
}

const getTaskTypeTag = (type) => {
  const map = { website: '', database: 'success', container: 'warning' }
  return map[type] || 'info'
}

const getTaskTypeAbbr = (type) => {
  const map = { website: '站', database: '库', container: '容' }
  return map[type] || '?'
}

const getTaskTypeClass = (type) => {
  return `type-${type}`
}
</script>

<style scoped>
.scheduled-tasks-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: calc(100vh - 84px);
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

.tips-alert {
  margin-bottom: 0;
}

/* 时间轴核心样式 */
.timeline-wrapper {
  flex: 1;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
}

.timeline-container {
  display: flex;
  min-width: 100%;
  width: max-content;
  height: 100%;
}

.timeline-sidebar {
  width: 100px;
  flex-shrink: 0;
  background: var(--el-bg-color-overlay);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  position: sticky;
  left: 0;
  z-index: 10;
  box-shadow: 2px 0 5px rgba(0,0,0,0.1);
}

.sidebar-slot {
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
}

.time-label {
  font-weight: bold;
  font-family: monospace;
  margin-bottom: 4px;
}

.timeline-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 800px; /* 保证最小宽度 */
}

.content-row {
  height: 80px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  transition: background 0.2s;
}

.content-row:hover {
  background: var(--el-fill-color-light);
}

.task-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 8px 12px;
  margin-right: 12px;
  min-width: 160px;
  max-width: 200px;
  cursor: grab;
  position: relative;
  box-shadow: var(--el-box-shadow-light);
  transition: all 0.2s;
  user-select: none;
}

.task-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow);
  border-color: var(--el-color-primary-light-5);
}

.task-card:active {
  cursor: grabbing;
}

/* 类型配色微调 */
.task-card.type-website { border-left: 3px solid var(--el-color-primary); }
.task-card.type-database { border-left: 3px solid var(--el-color-success); }
.task-card.type-container { border-left: 3px solid var(--el-color-warning); }

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.task-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 13px;
  overflow: hidden;
}

.name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-actions {
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  gap: 0;
}

.task-card:hover .task-actions {
  opacity: 1;
}

.task-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  justify-content: space-between;
}

.empty-slot-hint {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  opacity: 0.6;
}
</style>
