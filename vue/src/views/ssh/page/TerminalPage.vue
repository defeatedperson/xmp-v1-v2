<template>
  <div class="ssh-terminal-page">
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          class="node-select-wrapper"
        />
      </div>
      <div class="header-right">
        <el-select
          v-model="selectedTemplate"
          placeholder="选择模板"
          class="template-select"
          clearable
          @change="applyTemplate"
        >
          <el-option
            v-for="tpl in templates"
            :key="tpl.id"
            :label="tpl.title"
            :value="tpl.id"
          />
        </el-select>
        <el-button :icon="Refresh" :loading="loadingTemplates" @click="loadTemplates">
          刷新模板
        </el-button>
      </div>
    </div>

    <el-card class="panel-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>连接设置</span>
        </div>
      </template>
      <el-form label-position="top" class="connect-form">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="端口">
              <el-input-number v-model="port" :min="1" :max="65535" class="full-width" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="用户名">
              <el-input v-model="user" autocomplete="off" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="密码">
              <el-input v-model="password" type="password" autocomplete="off" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="action-row">
          <el-button
            type="primary"
            :loading="connecting"
            :disabled="connecting || !user || !password || !selectedNode"
            @click="connect"
          >
            连接
          </el-button>
          <el-button :disabled="!connected" @click="disconnect">断开</el-button>
          <el-button @click="clearOutput">清屏</el-button>
        </div>
      </el-form>
    </el-card>

    <el-card class="terminal-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>终端</span>
          <el-tag v-if="connected" type="success" effect="dark">已连接</el-tag>
          <el-tag v-else type="info" effect="dark">未连接</el-tag>
        </div>
      </template>
      <div class="terminal-box">
        <div v-if="!connected" class="terminal-placeholder">未连接</div>
        <div v-else ref="termContainer" class="terminal-container"></div>
      </div>
      <div class="terminal-input-row">
        <el-input
          v-model="quickInput"
          placeholder="在此粘贴命令后回车发送"
          :disabled="!connected"
          @keyup.enter="sendQuickInput"
        >
          <template #append>
            <el-button
              type="primary"
              :disabled="!connected || !quickInput"
              @click="sendQuickInput"
            >
              发送
            </el-button>
          </template>
        </el-input>
      </div>
    </el-card>

    <LinuxCommandsCard />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import NodeSelector from '@/components/NodeSelector.vue'
import LinuxCommandsCard from './modal/LinuxCommandsCard.vue'

const selectedNode = ref(null)
const port = ref(22)
const user = ref('')
const password = ref('')
const templates = ref([])
const selectedTemplate = ref('')
const connecting = ref(false)
const connected = ref(false)
const quickInput = ref('')
const termContainer = ref(null)
const loadingTemplates = ref(false)
let term = null
let fitAddon = null
let ws = null
let closing = false

const handleNodeSelected = (node) => { selectedNode.value = node }

const setupTerminal = () => {
  term = new Terminal({
    cursorBlink: true,
    fontFamily: 'monospace',
    fontSize: 14,
    theme: { background: 'var(--el-bg-color-overlay)', foreground: '#e5e7eb' }
  })
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  if (termContainer.value) {
    term.open(termContainer.value)
  }
  try { fitAddon.fit() } catch { void 0 }
}

const teardownTerminal = () => {
  try { if (term) term.dispose() } catch { void 0 }
  term = null
  fitAddon = null
}

const cleanup = () => { ws = null; connected.value = false; teardownTerminal() }

const disconnect = () => {
  closing = true
  try { if (ws && ws.readyState === WebSocket.OPEN) ws.close() } catch { void 0 }
  cleanup()
  try { ElMessage.info('终端连接已断开') } catch { void 0 }
}

const clearOutput = () => { try { if (term) term.clear() } catch { void 0 } }

const sendQuickInput = () => {
  const text = typeof quickInput.value === 'string' ? quickInput.value : ''
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return
  try {
    const encoder = new TextEncoder()
    ws.send(encoder.encode(`${text}\r`))
    quickInput.value = ''
  } catch { void 0 }
}

const applyTemplate = () => {
  try {
    const tpl = templates.value.find(t => t.id === selectedTemplate.value)
    if (!tpl) return
    port.value = tpl.port || 22
    user.value = tpl.user || ''
    password.value = tpl.password || ''
    try { ElMessage.success(`已应用模板: ${tpl.title}`) } catch { void 0 }
  } catch { void 0 }
}

const loadTemplates = async () => {
  loadingTemplates.value = true
  try {
    const res = await fetch('/api/ssh/templates')
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`)
    templates.value = Array.isArray(data.data) ? data.data : []
  } catch (e) {
    try { ElMessage.error(e.message || '模板加载失败') } catch { void 0 }
  } finally {
    loadingTemplates.value = false
  }
}

const connect = () => {
  if (!selectedNode.value || !user.value || !password.value) return
  if (!port.value || port.value < 1 || port.value > 65535) return
  connecting.value = true
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const qs = new URLSearchParams({ host: '127.0.0.1', port: String(port.value), user: user.value }).toString()
  const url = `${proto}//${location.host}/api/forward/${selectedNode.value.id}/ssh/terminal/ws?${qs}`
  ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  ws.onopen = async () => {
    try { ws.send(JSON.stringify({ type: 'auth', password: password.value })) } catch { void 0 }
    connected.value = true
    connecting.value = false
    await nextTick()
    setupTerminal()
    try { fitAddon.fit() } catch { void 0 }
    try { term.focus() } catch { void 0 }
    try { ElMessage.success(`连接成功: 节点 ${selectedNode.value.id}`) } catch { void 0 }
    const encoder = new TextEncoder()
    try {
      term.onData((data) => {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(encoder.encode(data))
          }
        } catch { void 0 }
      })
    } catch { void 0 }
  }
  ws.onmessage = (ev) => {
    try {
      if (ev.data instanceof ArrayBuffer) {
        const chunk = new TextDecoder().decode(new Uint8Array(ev.data))
        term.write(chunk)
      } else if (typeof ev.data === 'string') {
        term.write(ev.data)
      }
    } catch { void 0 }
  }
  ws.onclose = () => { if (closing) { closing = false; return } try { ElMessage.info('终端连接已关闭') } catch { void 0 } cleanup() }
  ws.onerror = () => { try { ElMessage.error('终端连接发生错误') } catch { void 0 } closing = true; try { ws.close() } catch { void 0 }; cleanup() }
}

const handleResize = () => { try { if (fitAddon) { fitAddon.fit() } } catch { void 0 } }

onMounted(() => { window.addEventListener('resize', handleResize); loadTemplates() })
onUnmounted(() => { window.removeEventListener('resize', handleResize); disconnect() })
</script>

<style scoped>
.ssh-terminal-page {
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

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-select-wrapper {
  width: 220px;
}

.template-select {
  width: 220px;
}

.panel-card,
.terminal-card {
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 500;
}

.connect-form {
  margin-top: 4px;
}

.full-width {
  width: 100%;
}

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.terminal-box {
  height: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.terminal-placeholder {
  color: var(--el-text-color-secondary);
}

.terminal-container {
  width: 100%;
  height: 100%;
}

.terminal-container :deep(.xterm) {
  background-color: var(--el-bg-color);
}

.terminal-input-row {
  margin-top: 12px;
}

@media (max-width: 1000px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .header-left,
  .header-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
