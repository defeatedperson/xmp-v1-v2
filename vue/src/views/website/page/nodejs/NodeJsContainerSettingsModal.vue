<template>
  <el-dialog
    v-model="visible"
    title="Node.js 设置"
    width="720px"
    :before-close="handleClose"
    class="nodejs-settings-modal"
  >
    <div class="modal-body" v-loading="loading">
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="error-alert" />
      <div v-else class="content-wrapper">
        <el-descriptions border :column="2" class="info-desc">
          <el-descriptions-item label="名称">{{ containerName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="镜像">{{ image || '-' }}</el-descriptions-item>
          <el-descriptions-item label="网络">{{ networkLabel }}</el-descriptions-item>
          <el-descriptions-item label="ID">{{ containerId || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-tabs v-model="activeTab" class="settings-tabs">
          <el-tab-pane label="启动命令" name="cmd">
            <el-form label-position="top" class="settings-form">
              <el-form-item label="启动命令">
                <el-input v-model="form.cmdText" placeholder="例如: npm start" />
                <div class="field-hint">【保存时必须填写启动命令】</div>
                <div class="field-hint">可使用全局剪切板功能记录常用命令</div>
              </el-form-item>
              <el-form-item label="是否自动整理依赖">
                <el-switch v-model="autoInstall" />
              </el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="端口映射" name="ports">
            <el-alert
              v-if="isHostNetwork"
              title="当前为 Host 网络，端口映射将不生效"
              type="info"
              show-icon
              :closable="false"
              class="hint-alert"
            />
            <div class="list-block">
              <div v-if="!ports.length && !isHostNetwork" class="empty-text">暂无端口映射</div>
              <div v-for="(item, index) in ports" :key="index" class="list-row">
                <el-input v-model="item.container" placeholder="容器端口，例如 3000" :disabled="isHostNetwork" />
                <span class="row-divider">→</span>
                <el-input v-model="item.host" placeholder="宿主机端口，例如 3000" :disabled="isHostNetwork" />
                <el-button type="danger" link :disabled="isHostNetwork" @click="removePort(index)">移除</el-button>
              </div>
              <el-button type="primary" plain :disabled="isHostNetwork" @click="addPort">添加端口</el-button>
            </div>
          </el-tab-pane>

          <el-tab-pane label="环境变量" name="env">
            <div class="list-block">
              <div class="paste-block">
                <el-input
                  v-model="envPasteText"
                  type="textarea"
                  :rows="4"
                  placeholder="粘贴 .env 内容，例如: KEY=VALUE"
                />
                <div class="paste-actions">
                  <el-button type="primary" plain @click="applyEnvPaste">解析并覆盖</el-button>
                  <el-button @click="envPasteText = ''">清空</el-button>
                </div>
              </div>
              <div v-if="!envs.length" class="empty-text">暂无环境变量</div>
              <div v-for="(item, index) in envs" :key="index" class="list-row">
                <el-input v-model="item.name" placeholder="变量名，例如 NODE_ENV" />
                <span class="row-divider">=</span>
                <el-input v-model="item.value" placeholder="变量值，例如 production" />
                <el-button type="danger" link @click="removeEnv(index)">移除</el-button>
              </div>
              <el-button type="primary" plain @click="addEnv">添加变量</el-button>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <template #footer>
      <div class="footer-actions">
        <span class="footer-hint">保存后容器将重建</span>
        <div class="footer-buttons">
          <el-button @click="handleClose" :disabled="saving">取消</el-button>
          <el-button type="primary" @click="submit" :loading="saving" :disabled="loading">保存并重建</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, required: true },
  containerId: { type: String, required: true },
})

const emit = defineEmits(['update:modelValue', 'updated'])

const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const activeTab = ref('cmd')
const containerName = ref('')
const image = ref('')
const form = ref({ cmdText: '' })
const autoInstall = ref(false)
const ports = ref([])
const envs = ref([])
const envPasteText = ref('')
const networkMode = ref('default')
const networkNames = ref('xmp-network')

const isHostNetwork = computed(() => networkMode.value === 'host')
const networkLabel = computed(() => {
  if (networkMode.value === 'host') return 'host'
  const names = networkNames.value.split(',').map(s => s.trim()).filter(Boolean)
  if (!names.length) return 'xmp-network'
  return names.join(', ')
})

const resetState = () => {
  error.value = ''
  containerName.value = ''
  image.value = ''
  form.value.cmdText = ''
  autoInstall.value = false
  ports.value = []
  envs.value = []
  envPasteText.value = ''
  networkMode.value = 'default'
  networkNames.value = 'xmp-network'
  activeTab.value = 'cmd'
}

const addPort = () => { ports.value.push({ container: '', host: '' }) }
const removePort = (i) => { ports.value.splice(i, 1) }
const addEnv = () => { envs.value.push({ name: '', value: '' }) }
const removeEnv = (i) => { envs.value.splice(i, 1) }

const applyEnvPaste = () => {
  const text = String(envPasteText.value || '')
  if (!text.trim()) {
    ElMessage.warning('请先粘贴环境变量内容')
    return
  }
  const map = new Map()
  envs.value.forEach((item) => {
    const key = String(item.name || '').trim()
    if (key) {
      map.set(key, String(item.value || ''))
    }
  })
  const lines = text.split(/\r?\n/)
  lines.forEach((line) => {
    const raw = String(line || '').trim()
    if (!raw || raw.startsWith('#')) return
    const idx = raw.indexOf('=')
    if (idx <= 0) return
    const key = raw.slice(0, idx).trim()
    let value = raw.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) map.set(key, value)
  })
  envs.value = Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  ElMessage.success('环境变量已更新')
}

const buildStartupCommand = (command) => {
  const raw = String(command || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (lower.startsWith('npm install') || lower.startsWith('npm ci')) return raw
  return `npm install && ${raw}`
}

const parseCmdText = (text, installFirst) => {
  const t = String(text || '').trim()
  if (!t) return []
  const cmdText = installFirst ? buildStartupCommand(t) : t
  if (installFirst) {
    return ['sh', '-c', cmdText]
  }
  const parts = cmdText.match(/"[^"]*"|'[^']*'|\S+/g) || []
  return parts.map(s => s.replace(/^['"]|['"]$/g, ''))
}

const applyCmdText = (info) => {
  const cmd = info?.cmd || info?.command || info?.Cmd || info?.Config?.Cmd || info?.config?.Cmd
  if (Array.isArray(cmd)) {
    form.value.cmdText = cmd.join(' ')
  } else if (cmd) {
    form.value.cmdText = String(cmd)
  } else {
    form.value.cmdText = ''
  }
}

const loadNetworks = async () => {
  try {
    const networkRes = await fetch(`/api/forward/${props.nodeId}/docker/containers/${props.containerId}/networks`)
    if (!networkRes.ok) return
    const networkJson = await networkRes.json()
    if (networkJson && networkJson.success && networkJson.data) {
      const resultNetworks = networkJson.data || {}
      const nets = Array.isArray(resultNetworks.networks) ? resultNetworks.networks : []
      const names = nets.map(n => String(n.name || '')).filter(Boolean)
      const hasHost = names.some(n => n.toLowerCase() === 'host')
      if (hasHost) {
        networkMode.value = 'host'
        networkNames.value = ''
      } else if (names.length === 0) {
        networkMode.value = 'default'
        networkNames.value = 'xmp-network'
      } else if (names.length === 1 && names[0] === 'xmp-network') {
        networkMode.value = 'default'
        networkNames.value = 'xmp-network'
      } else {
        networkMode.value = 'custom'
        networkNames.value = names.join(',')
      }
    }
  } catch { void 0 }
}

const loadContainerInfo = async () => {
  if (!props.nodeId || !props.containerId) return
  loading.value = true
  error.value = ''
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const result = await res.json()
    if (!result.success) throw new Error(result.message || '加载容器信息失败')
    const info = result.data || {}
    containerName.value = info.name || ''
    image.value = info.image || ''
    applyCmdText(info)

    ports.value = []
    if (info.ports) {
      Object.entries(info.ports).forEach(([key, value]) => {
        const containerPort = String(key).split('/')[0]
        if (Array.isArray(value)) {
          value.forEach((mapping) => {
            ports.value.push({
              container: containerPort,
              host: mapping?.HostPort || '',
            })
          })
        }
      })
    }

    envs.value = []
    if (Array.isArray(info.env)) {
      info.env.forEach((str) => {
        const idx = String(str).indexOf('=')
        if (idx > -1) {
          envs.value.push({
            name: String(str).slice(0, idx),
            value: String(str).slice(idx + 1),
          })
        }
      })
    }

    await loadNetworks()
  } catch (e) {
    error.value = e.message || '加载容器信息失败'
  } finally {
    loading.value = false
  }
}

const handleClose = () => {
  if (loading.value || saving.value) return
  visible.value = false
}

const submit = async () => {
  if (!props.nodeId || !props.containerId) return
  if (!image.value) {
    ElMessage.error('未获取到镜像信息')
    return
  }
  const rawCmd = String(form.value.cmdText || '').trim()
  if (!rawCmd) {
    ElMessage.error('请填写启动命令')
    activeTab.value = 'cmd'
    return
  }
  const cmdParts = parseCmdText(rawCmd, autoInstall.value)
  const config = {
    image: image.value,
    cmd: cmdParts,
    env: envs.value.filter(e => e.name && e.value).map(e => ({ name: e.name, value: e.value })),
    ports: Object.fromEntries(ports.value.filter(p => p.container && p.host).map(p => [String(p.container).trim(), Number(p.host)])),
    networkMode: networkMode.value === 'host' ? 'host' : undefined,
    networks: networkMode.value === 'host' ? [] : (networkMode.value === 'custom' ? networkNames.value.split(',').map(s => s.trim()).filter(Boolean) : ['xmp-network']),
    publicAccess: false,
  }
  saving.value = true
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/upgrade`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const result = await res.json()
    if (!result.success) throw new Error(result.message || '更新失败')
    ElMessage.success('配置已保存，容器正在重建中')
    emit('updated')
    visible.value = false
  } catch (e) {
    ElMessage.error(e.message || '保存配置失败')
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val) {
      resetState()
      loadContainerInfo()
    }
  },
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

watch(
  () => [props.nodeId, props.containerId],
  () => {
    if (visible.value) {
      resetState()
      loadContainerInfo()
    }
  },
)
</script>

<style scoped>
.modal-body {
  min-height: 420px;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-desc {
  background: var(--el-bg-color);
}

.settings-form {
  padding-top: 6px;
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hint-alert {
  margin-bottom: 12px;
}

.list-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.row-divider {
  color: var(--el-text-color-secondary);
}

.empty-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.paste-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.paste-actions {
  display: flex;
  gap: 10px;
}

.footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.footer-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.footer-buttons {
  display: flex;
  gap: 10px;
}
</style>
