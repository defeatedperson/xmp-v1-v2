<template>
  <teleport to="body">
    <div
      v-if="!isMobile && !visible"
      class="clipboard-fab"
      @click="onFabClick"
    >
      <el-badge :value="items.length" :hidden="!items.length" :max="99" type="primary">
        <div class="fab-content">
          <el-icon><CopyDocument /></el-icon>
          <span class="fab-text">剪切板</span>
        </div>
      </el-badge>
    </div>

    <transition name="fade-slide">
      <div
        v-if="!isMobile && visible"
        class="clipboard-window"
        :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      >
        <div class="window-header" @mousedown="onDragStart" @touchstart.prevent="onDragStart">
          <div class="title">
            <el-icon><CopyDocument /></el-icon>
            <span>剪切板</span>
          </div>
          <div class="header-actions">
            <el-button
              link
              :icon="Close"
              @click="togglePanel"
            />
          </div>
        </div>
        <div class="window-body" @click.stop>
          <el-input
            v-model="inputText"
            type="textarea"
            :rows="4"
            :maxlength="MAX_ITEM_LENGTH"
            show-word-limit
            placeholder="在此粘贴文本..."
            @keydown.ctrl.enter.prevent="addItem"
          />

          <div class="actions-row">
            <el-button type="primary" size="small" @click="addItem">添加</el-button>
            <el-button size="small" @click="copyCurrent">复制当前</el-button>
            <el-button type="danger" plain size="small" @click="clearInput">清空</el-button>
          </div>

          <el-scrollbar class="items-list-container">
            <div class="items-list">
              <div v-for="item in items" :key="item.id" class="item-row">
                <div class="item-text" :title="item.text">{{ truncate(item.text) }}</div>
                <div class="item-actions">
                  <el-button
                    link
                    type="primary"
                    :icon="CopyDocument"
                    @click="copy(item.text)"
                  />
                  <el-button
                    link
                    type="danger"
                    :icon="Delete"
                    @click="remove(item.id)"
                  />
                </div>
              </div>
              <el-empty v-if="items.length === 0" :image-size="40" description="暂无条目" />
            </div>
          </el-scrollbar>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Delete, Close } from '@element-plus/icons-vue'

const STORAGE_KEY = 'xmp_clipboard_items'
const POS_KEY = 'xmp_clipboard_pos'
const MAX_ITEMS = 20
const MAX_ITEM_LENGTH = 1000

const inputText = ref('')
const items = ref([])
const visible = ref(false)
const isMobile = ref(false)
const dragging = ref(false)
const start = ref({ x: 0, y: 0 })
const pos = ref({ x: 0, y: 100 })
const size = { w: 360, h: 380 }

function togglePanel() {
  visible.value = !visible.value
}

function onFabClick() {
  openWindowNearFab()
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr = JSON.parse(raw || '[]')
    if (Array.isArray(arr)) {
      items.value = arr.slice(0, MAX_ITEMS).map((x) => ({
        id: String(x.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        text: String(x.text || '').slice(0, MAX_ITEM_LENGTH),
        createdAt: Number(x.createdAt || Date.now()),
      }))
    } else {
      items.value = []
    }
  } catch {
    void 0
    items.value = []
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
  } catch { void 0 }
}

function addItem() {
  const t = String(inputText.value || '').trim()
  if (!t) {
    ElMessage({ message: '内容为空', type: 'warning' })
    return
  }
  const limited = t.slice(0, MAX_ITEM_LENGTH)
  items.value.unshift({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, text: limited, createdAt: Date.now() })
  if (items.value.length > MAX_ITEMS) items.value.splice(MAX_ITEMS)
  save()
  ElMessage({ message: '已添加到列表', type: 'success' })
}

function remove(id) {
  const idx = items.value.findIndex((x) => x.id === id)
  if (idx >= 0) {
    items.value.splice(idx, 1)
    save()
  }
}

function clearInput() {
  inputText.value = ''
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage({ message: '已复制到剪贴板', type: 'success' })
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try { document.execCommand('copy'); ElMessage({ message: '已复制到剪贴板', type: 'success' }) } catch { /* ignore */ }
    document.body.removeChild(ta)
  }
}

function copyCurrent() {
  const t = String(inputText.value || '')
  if (!t) {
    ElMessage({ message: '无可复制内容', type: 'warning' })
    return
  }
  copy(t)
}

function truncate(s) {
  const MAX_PREVIEW = 80
  return s.length > MAX_PREVIEW ? s.slice(0, MAX_PREVIEW) + '…' : s
}

function handleStorage(e) {
  if (e.key === STORAGE_KEY) load()
}

onMounted(() => {
  load()
  window.addEventListener('storage', handleStorage)
  window.addEventListener('resize', checkMobile)
  checkMobile()
  restorePos()
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.addEventListener('touchmove', onDragMove)
  document.addEventListener('touchend', onDragEnd)
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorage)
  window.removeEventListener('resize', checkMobile)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('touchmove', onDragMove)
  document.removeEventListener('touchend', onDragEnd)
})

function checkMobile() {
  isMobile.value = window.innerWidth <= 768
  if (isMobile.value) visible.value = false
}

function onDragStart(ev) {
  dragging.value = true
  const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
  const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY
  start.value = { x: clientX - pos.value.x, y: clientY - pos.value.y }
}

function onDragMove(ev) {
  if (!dragging.value) return
  const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
  const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY
  let nx = clientX - start.value.x
  let ny = clientY - start.value.y
  const maxX = window.innerWidth - size.w - 8
  const maxY = window.innerHeight - size.h - 8
  pos.value.x = Math.max(8, Math.min(nx, maxX))
  pos.value.y = Math.max(8, Math.min(ny, maxY))
}

function onDragEnd() {
  if (!dragging.value) return
  dragging.value = false
  savePos()
}


function restorePos() {
  try {
    const raw = localStorage.getItem(POS_KEY)
    const p = JSON.parse(raw || '{}')
    if (typeof p.x === 'number' && typeof p.y === 'number') {
      pos.value.x = p.x
      pos.value.y = p.y
    } else {
      pos.value.x = Math.max(8, window.innerWidth - size.w - 24)
      pos.value.y = 100
    }
  } catch {
    pos.value.x = Math.max(8, window.innerWidth - size.w - 24)
    pos.value.y = 100
  }
}

function savePos() {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos.value))
  } catch { void 0 }
}

function openWindowNearFab() {
  const maxX = window.innerWidth - size.w - 8
  const maxY = window.innerHeight - size.h - 8
  const desiredX = window.innerWidth - size.w - 20
  const desiredY = window.innerHeight - size.h - 30 - 12
  pos.value.x = Math.max(8, Math.min(desiredX, maxX))
  pos.value.y = Math.max(8, Math.min(desiredY, maxY))
  visible.value = true
}

</script>

<style scoped>
.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.2s ease; }
.fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateY(-4px); }

.clipboard-fab {
  position: fixed;
  right: 20px;
  bottom: 70px;
  cursor: pointer;
  z-index: 998;
}

.fab-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--el-bg-color-overlay);
  color: var(--el-text-color-regular);
  border: 1px solid var(--el-border-color);
  border-radius: 20px;
  padding: 8px 16px;
  box-shadow: var(--el-box-shadow-light);
  transition: all 0.3s ease;
}

.fab-content:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.fab-text { font-size: 13px; font-weight: 500; }

.clipboard-window {
  position: fixed;
  width: 360px;
  height: 420px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-dark);
  z-index: 999;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.window-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-light);
  cursor: move;
}

.title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.window-body {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.actions-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.items-list-container {
  flex: 1;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-blank);
  min-height: 0;
}

.items-list {
  padding: 4px 0;
}

.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  transition: background-color 0.2s;
}

.item-row:hover {
  background-color: var(--el-fill-color-light);
}

.item-text {
  flex: 1;
  color: var(--el-text-color-regular);
  font-size: 13px;
  word-break: break-all;
  line-height: 1.4;
}

.item-actions {
  display: flex;
  gap: 4px;
}

:deep(.el-textarea__inner) {
  font-family: inherit;
}
</style>
