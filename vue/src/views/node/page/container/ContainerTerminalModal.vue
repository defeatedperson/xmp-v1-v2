<template>
  <el-dialog
    v-model="visible"
    title="容器终端"
    width="900px"
    :before-close="handleClose"
    class="terminal-modal"
    destroy-on-close
  >
    <div class="terminal-body">
      <div v-if="connecting" class="loading-state">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <p>正在连接终端...</p>
      </div>

      <div v-if="error" class="error-state">
        <el-alert :title="error" type="error" show-icon :closable="false" />
      </div>

      <div class="terminal-wrapper" v-show="!connecting && !error">
        <div ref="termEl" class="terminal-view"></div>
      </div>
    </div>

    <template #footer>
      <div class="terminal-footer">
        <div class="left-controls">
          <el-tag :type="connected ? 'success' : 'danger'" size="small">
            {{ connected ? '已连接' : '未连接' }}
          </el-tag>
          <el-switch
            v-model="mode"
            active-text="sh兼容（默认）"
            inactive-text="bash模式"
            :disabled="connecting || connected"
          />
        </div>

        <div class="right-controls">
          <el-button @click="clearOutput" :disabled="!connected">清屏</el-button>
          <el-button
            :type="connected ? 'danger' : 'primary'"
            @click="connected ? disconnect() : connect()"
            :loading="connecting"
          >
            {{ connected ? '断开' : '连接' }}
          </el-button>
          <el-button @click="handleClose">关闭</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onBeforeUnmount, nextTick, computed, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Loading } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, required: true },
  containerId: { type: String, required: true },
  rows: { type: Number, default: 24 },
  cols: { type: Number, default: 80 },
  shell: { type: String, default: '/bin/sh' }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const ws = ref(null)
const connected = ref(false)
const connecting = ref(false)
const error = ref('')
const termEl = ref(null)
let term = null
let fit = null
const mode = ref(props.shell === '/bin/sh')

const currentShell = computed(() => (mode.value ? '/bin/sh' : '/bin/bash'))

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    nextTick(() => {
      connect()
    })
  } else {
    disconnect()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

function makeWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  const path = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/terminal/ws`
  const query = new URLSearchParams({ rows: String(props.rows), cols: String(props.cols), shell: currentShell.value })
  return `${proto}://${host}${path}?${query.toString()}`
}

function connect() {
  if (!props.nodeId || !props.containerId) return

  disconnect() // Clean up previous connection if any

  const url = makeWsUrl()
  connecting.value = true
  error.value = ''

  try {
    const socket = new WebSocket(url)
    ws.value = socket
    socket.binaryType = 'arraybuffer'

    socket.onopen = async () => {
      connected.value = true
      connecting.value = false
      await nextTick()

      if (!termEl.value) return

      // Clean up previous terminal instance
      if (term) term.dispose()

      fit = new FitAddon()
      term = new Terminal({
        rows: props.rows,
        cols: props.cols,
        convertEol: true,
        cursorBlink: true,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4'
        }
      })

      term.loadAddon(fit)
      term.open(termEl.value)

      try {
        fit.fit()
      } catch (e) {
        console.warn('Fit addon error:', e)
      }

      term.focus()

      term.onData((d) => {
        try {
          if (ws.value && ws.value.readyState === WebSocket.OPEN) {
            const bytes = new TextEncoder().encode(d)
            ws.value.send(bytes)
          }
        } catch (e) {
          console.error('Send error:', e)
        }
      })

      // Handle window resize
      window.addEventListener('resize', handleResize)
    }

    socket.onmessage = (ev) => {
      let chunk = ''
      if (ev.data instanceof ArrayBuffer) {
        chunk = new TextDecoder().decode(new Uint8Array(ev.data))
      } else if (typeof ev.data === 'string') {
        chunk = ev.data
      }
      try { if (term) term.write(chunk) } catch (e) { console.error('Write error:', e) }
    }

    socket.onerror = () => {
      error.value = '终端连接发生错误'
      connecting.value = false
    }

    socket.onclose = () => {
      connected.value = false
      connecting.value = false
      try { if (term) term.blur() } catch {
        // 忽略关闭时的错误
      }
    }

  } catch (e) {
    error.value = e.message || '无法建立终端连接'
    connecting.value = false
  }
}

function handleResize() {
  try {
    if (fit) fit.fit()
  } catch {
    // 忽略调整大小时的错误
  }
}

function clearOutput() {
  try { if (term) term.clear() } catch {
    // 忽略清屏错误
  }
}

function disconnect() {
  if (ws.value) {
    try { ws.value.close() } catch {
      // 忽略关闭连接错误
    }
    ws.value = null
  }
  connected.value = false
  connecting.value = false
  window.removeEventListener('resize', handleResize)
}

function handleClose() {
  if (connecting.value) return
  disconnect()
  visible.value = false
}

onBeforeUnmount(() => {
  disconnect()
  try { if (term) term.dispose() } catch {
    // 忽略销毁时的错误
  }
})
</script>

<style scoped>
.terminal-body {
  min-height: 400px;
  background-color: #1e1e1e;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.loading-state, .error-state {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  z-index: 10;
  background-color: rgba(30, 30, 30, 0.8);
}

.terminal-wrapper {
  flex: 1;
  padding: 10px;
  overflow: hidden;
}

.terminal-view {
  height: 100%;
  width: 100%;
}

.terminal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.left-controls {
  display: flex;
  align-items: center;
  gap: 15px;
}

.right-controls {
  display: flex;
  gap: 10px;
}
</style>
