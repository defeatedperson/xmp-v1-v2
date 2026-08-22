<template>
  <Teleport to="body">
    <div class="modal-overlay">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <div>
          <h2>安装应用</h2>
          <NodeSelector :nodeType="1" @node-selected="onNodeSelected" @error="onNodeError" />
        </div>
        <div class="header-buttons">
          <button class="close-button" @click="close" :disabled="loading">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="container-banner">
          <div class="banner-icon">
            <i class="fas fa-rocket"></i>
          </div>
          <div class="banner-content">
            <span class="banner-label">正在安装应用</span>
            <span class="banner-value">{{ app?.name || '未知应用' }}</span>
          </div>
        </div>
        <div v-if="loading" class="loading-container">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>
        <div v-else class="content-wrapper">
          <div class="section" v-if="setupFields.length > 0">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-magic"></i> 应用初始化配置</h3>
            </div>
            <div class="section-content">
              <div v-for="(field, key) in setupConfig" :key="key" class="setup-field-group">
                <!-- 数据库配置专用UI -->
                <div v-if="key === 'database'" class="database-setup-card">
                  <div class="setup-card-header">
                    <span class="setup-label"><i class="fas fa-database"></i> {{ field.label || '数据库配置' }}</span>
                    <span class="status-badge" :class="dbStatusClass">{{ dbStatusText }}</span>
                  </div>

                  <div v-if="dbError" class="alert-danger small">{{ dbError }}</div>

                  <!-- 数据库未就绪时的表单 -->
                  <div v-if="!dbReady && !dbError" class="database-form">
                    <div class="form-grid">
                      <label class="form-item">
                        <span class="label">数据库名</span>
                        <input class="input" v-model="dbForm.dbName" placeholder="例如: halo" />
                      </label>
                      <label class="form-item">
                        <span class="label">用户名</span>
                        <input class="input" v-model="dbForm.userName" placeholder="例如: halo_user" />
                      </label>
                    </div>
                    <label class="form-item">
                      <span class="label">密码</span>
                      <div class="input-with-btn">
                        <input class="input" v-model="dbForm.password" placeholder="请输入强密码" />
                        <button class="mini-btn" @click="generateDbPassword">生成</button>
                      </div>
                    </label>
                    <div class="action-row-left">
                      <button class="btn primary small" @click="createDatabase" :disabled="dbCreating || !dbForm.dbName || !dbForm.userName || !dbForm.password">
                        {{ dbCreating ? '创建中...' : '一键创建并配置' }}
                      </button>
                      <button class="btn small" @click="saveDatabaseConfig" :disabled="dbCreating || !dbForm.dbName || !dbForm.userName || !dbForm.password" style="margin-left: 10px;">
                        仅保存配置(不创建)
                      </button>
                    </div>
                  </div>

                  <!-- 数据库已就绪时的展示 -->
                  <div v-else-if="dbReady" class="database-info">
                    <div class="info-row">
                      <span class="info-label">连接地址:</span>
                      <span class="info-value">{{ dbResult.url }}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">用户名:</span>
                      <span class="info-value">{{ dbResult.userName }}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">密码:</span>
                      <span class="info-value">******</span>
                      <button class="mini-btn text" @click="resetDbSetup">重置</button>
                    </div>
                  </div>
                </div>

                <!-- 普通字段配置UI -->
                <div v-else class="generic-setup-field">
                  <label class="form-item">
                    <span class="label">
                      {{ field.label || key }}
                      <span v-if="field.required" class="required-mark">*</span>
                    </span>
                    <div class="input-desc" v-if="field.description">{{ field.description }}</div>
                    <input class="input" v-model="setupValues[key]" :placeholder="field.default || ''" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-layer-group"></i> 选择版本</h3>
            </div>
            <div class="section-content">
              <div class="version-select-row">
                <select class="input version-select" v-model="selectedVersionIndex">
                  <option v-for="(v, idx) in versionList" :key="idx" :value="idx">{{ v.version }}</option>
                </select>
              </div>
            </div>
          </div>
          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-sliders-h"></i> 更多设置</h3>
              <button class="mini-btn" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? '收起' : '展开' }}</button>
            </div>
          </div>
          <div class="section" v-if="showAdvanced">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-cog"></i> 基础配置</h3>
            </div>
            <div class="section-content">
              <div class="form-grid">
                <label class="form-item">
                  <span class="label">镜像</span>
                  <input class="input" v-model="form.image" :disabled="true" />
                </label>
                <label class="form-item">
                  <span class="label">名称</span>
                  <input class="input" v-model="form.name" :disabled="nameLocked" />
                </label>
              </div>
              <label class="form-item">
                <span class="label">启动命令</span>
                <input class="input" v-model="form.cmdText" />
              </label>
            </div>
          </div>
          <div class="section">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-plug"></i> 端口映射（右侧是外部端口）</h3>
              <button class="mini-btn" @click="addPort" :disabled="true">添加</button>
            </div>
            <div class="section-content">
              <div class="list">
                <div class="row" v-for="(p, idx) in ports" :key="idx">
                  <input class="input small" v-model="p.container" placeholder="容器端口" :disabled="true" />
                  <span class="arrow">→</span>
                  <input class="input small" v-model="p.host" placeholder="主机端口" :disabled="portEditDisabled" />
                  <button class="mini-btn danger" @click="removePort(idx)" :disabled="portEditDisabled">删除</button>
                </div>
                <div v-if="ports.length === 0" class="muted">无端口映射</div>
              </div>
            </div>
          </div>
          <div class="section" v-if="showAdvanced">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-hdd"></i> 卷挂载</h3>
              <button class="mini-btn" @click="addVolume" :disabled="volumeLocked">添加</button>
            </div>
            <div class="section-content">
              <div class="alert-warning" v-if="networkMode === 'host'">
                Host 网络模式下不推荐修改挂载路径+网络模式，可能出现未知错误
              </div>
              <div class="list">
                <div class="row" v-for="(v, idx) in volumes" :key="idx">
                  <input class="input medium" v-model="v.container" placeholder="容器路径" :disabled="volumeLocked" />
                  <span class="arrow">←→</span>
                  <input class="input medium" v-model="v.host" placeholder="主机路径或相对路径" :disabled="volumeLocked" />
                  <select class="input small" v-model="v.type" :disabled="volumeLocked">
                    <option value="dir">目录</option>
                    <option value="file">文件</option>
                  </select>
                  <button class="mini-btn danger" @click="removeVolume(idx)" :disabled="volumeLocked">删除</button>
                </div>
                <div v-if="volumes.length === 0" class="muted">无挂载</div>
              </div>
            </div>
          </div>
          <div class="section" v-if="showAdvanced">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-list"></i> 环境变量</h3>
              <button class="mini-btn" @click="addEnv">添加</button>
            </div>
            <div class="section-content">
              <div class="list">
                <div class="row" v-for="(e, idx) in envs" :key="idx">
                  <input class="input medium" v-model="e.name" placeholder="名称" />
                  <span class="arrow">=</span>
                  <input class="input medium" v-model="e.value" placeholder="值" />
                  <button class="mini-btn danger" @click="removeEnv(idx)">删除</button>
                </div>
                <div v-if="envs.length === 0" class="muted">无环境变量</div>
              </div>
            </div>
          </div>
          <div class="section" v-if="showAdvanced">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-network-wired"></i> 网络</h3>
            </div>
            <div class="section-content">
              <div class="form-grid">
                <label class="form-item">
                  <span class="label">网络模式</span>
                  <select class="input" v-model="networkMode">
                    <option value="default">默认（xmp-network）</option>
                    <option value="host">host</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div class="section" v-if="networkMode !== 'host'">
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-shield-alt"></i> 访问控制</h3>
            </div>
            <div class="section-content">
              <div class="row">
                <ToggleButton v-model="isPublic" label="允许公网访问" />
                <div class="muted" v-if="!isPublic">未开启公网访问：无法通过外网访问，仅内网通信，适合作为运行环境</div>
              </div>
              <div class="alert-danger" v-if="isPublic"><i class="fas fa-exclamation-triangle"></i> 已开启公网访问：请谨慎将运行环境设置为【允许公网访问】，示例：php、mysql、redis</div>
            </div>
          </div>
          <div class="section" v-else>
            <div class="section-header">
              <h3 class="section-title"><i class="fas fa-shield-alt"></i> 访问控制</h3>
            </div>
            <div class="section-content">
              <div class="muted">Host 网络模式下访问控制不可用，服务将随宿主机网络暴露</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <div class="action-row">
          <button class="btn" @click="close" :disabled="loading">取消</button>
          <button class="btn primary" @click="submit" :disabled="loading">安装软件</button>
        </div>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import NodeSelector from '@/components/NodeSelector.vue'
import ToggleButton from '@/components/ToggleButton.vue'
import { ElMessage } from 'element-plus'

const props = defineProps({ app: { type: Object, required: true } })
const emit = defineEmits(['close', 'submit'])

const loading = ref(false)
const selectedNodeId = ref('')
const selectedVersionIndex = ref(0)

const form = ref({ image: '', name: '', cmdText: '' })
const ports = ref([])
const volumes = ref([])
const envs = ref([])
const networkMode = ref('default')
const isPublic = ref(false)
const showAdvanced = ref(false)
const nameLocked = ref(false)
const portLocked = ref(false)
const volumeLocked = ref(false)
const portEditDisabled = computed(() => portLocked.value || networkMode.value === 'host')

// Setup Logic
const setupConfig = ref({})
const setupFields = computed(() => Object.keys(setupConfig.value))
const setupValues = ref({})

// Database Setup State
const dbForm = ref({ dbName: '', userName: '', password: '' })
const dbCreating = ref(false)
const dbError = ref('')
const dbReady = ref(false)
const dbResult = ref(null) // { url, userName, password }
const dbStatusText = computed(() => {
  if (dbError.value) return '环境异常'
  if (dbReady.value) return '已就绪'
  return '待配置'
})
const dbStatusClass = computed(() => {
  if (dbError.value) return 'status-error'
  if (dbReady.value) return 'status-ready'
  return 'status-pending'
})

const versionList = computed(() => Array.isArray(props.app?.versions) ? props.app.versions : [])

const addPort = () => { ports.value.push({ container: '', host: '' }) }
const removePort = (i) => { ports.value.splice(i, 1) }
const addVolume = () => { volumes.value.push({ container: '', host: '', type: 'dir' }) }
const removeVolume = (i) => { volumes.value.splice(i, 1) }
const addEnv = () => { envs.value.push({ name: '', value: '' }) }
const removeEnv = (i) => { envs.value.splice(i, 1) }

const close = () => { if (!loading.value) emit('close') }
const onNodeSelected = (node) => { selectedNodeId.value = node && node.id ? String(node.id) : '' }
const onNodeError = (msg) => { ElMessage.error(msg || '选择节点失败') }

const parseEnv = (arr) => {
  if (!Array.isArray(arr)) return []
  return arr.map((it) => {
    if (typeof it === 'string') {
      const idx = it.indexOf('=')
      if (idx > 0) return { name: it.slice(0, idx), value: it.slice(idx + 1) }
      return { name: it, value: '' }
    }
    if (it && typeof it === 'object') {
      const name = it.name ?? ''
      const value = it.value ?? ''
      return { name, value }
    }
    return { name: '', value: '' }
  })
}

const generateStrongPassword = (len = 24) => {
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const digits = '0123456789'
  // Use a safe subset of symbols that are allowed by the backend regex
  // Backend regex: /^[A-Za-z0-9_!@#$%^&*()\-+=\.:,?]{8,128}$/
  // CreateDatabaseModal uses: !@#$%^&*()-_=+
  const symbols = '!@#$%^&*()-_=+'
  const all = lower + upper + digits + symbols
  const arr = []
  const pick = (pool) => pool[Math.floor(Math.random() * pool.length)]
  arr.push(pick(lower))
  arr.push(pick(upper))
  arr.push(pick(digits))
  arr.push(pick(symbols))
  for (let i = arr.length; i < len; i++) arr.push(pick(all))
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t }
  return arr.join('')
}

const fillPasswords = () => {
  envs.value = (envs.value || []).map(e => {
    const n = String(e.name || '')
    if (n.toLowerCase().includes('password')) return { name: n, value: generateStrongPassword() }
    return e
  })
}

const normalizeHostPath = (p) => {
  let t = String(p || '').trim()
  t = t.replace(/^(\$\(pwd\)|\$\{PWD\}|\$PWD|%cd%)/i, '')
  t = t.replace(/^[\\/]+/, '')
  t = t.replace(/^\.\//, '')
  return t || String(p || '')
}

const getRepoName = (img) => {
  const s = String(img || '')
  const last = (s.split('/').pop() || s)
  return (last.split(':')[0] || '').trim()
}
const randomSuffix = (len = 4) => {
  const r = Math.random().toString(36).slice(2)
  return r.slice(0, len)
}
const makeContainerName = (img) => {
  const base = getRepoName(img) || 'container'
  return `${base}-${randomSuffix(4)}`
}

const loadVersion = (v) => {
  const image = String(v?.image || '')
  const command = String(v?.command || '')
  const network = String(v?.network || '').toLowerCase()
  const containerName = String(v?.containerName || '')
  const portclock = v?.portclock === true
  const pArr = Array.isArray(v?.ports) ? v.ports : []
  const vArr = Array.isArray(v?.volumes) ? v.volumes : []
  const eArr = Array.isArray(v?.env) ? v.env : []
  form.value.image = image
  form.value.name = containerName || makeContainerName(image)
  form.value.cmdText = command
  ports.value = pArr.map((p) => ({ container: String(p.container || ''), host: String(p.host || '') }))
  volumes.value = vArr.map((m) => {
    const type = typeof m.type === 'string' ? m.type : 'dir'
    return { container: String(m.container || ''), host: normalizeHostPath(m.host), type }
  })
  envs.value = parseEnv(eArr)
  nameLocked.value = !!containerName
  portLocked.value = !!portclock
  volumeLocked.value = String(containerName || '').toLowerCase() === 'openresty'
  fillPasswords()
  networkMode.value = network === 'host' ? 'host' : 'default'

  // Setup Init
  setupConfig.value = v.setup || {}
  setupValues.value = {}
  dbReady.value = false
  dbResult.value = null
  dbError.value = ''
  dbForm.value = { dbName: '', userName: '', password: '' }

  // Initialize generic fields
  for (const k in setupConfig.value) {
    if (k === 'database') {
      // Auto-fill db form with app name if available
      const safeName = (form.value.name || 'app').replace(/[^a-zA-Z0-9_]/g, '_')
      dbForm.value.dbName = safeName
      dbForm.value.userName = safeName
    } else {
      setupValues.value[k] = setupConfig.value[k].default || ''
    }
  }

  // Check Database availability if needed
  if (setupConfig.value.database && selectedNodeId.value) {
    checkDatabaseAvailability()
  }
}

watch(selectedVersionIndex, (idx) => {
  const v = versionList.value[idx] || null
  if (v) loadVersion(v)
})

watch(selectedNodeId, (nid) => {
  if (nid && setupConfig.value.database) {
    checkDatabaseAvailability()
  }
})

const checkDatabaseAvailability = async () => {
  if (!selectedNodeId.value) return
  dbError.value = ''
  try {
    const res = await fetch(`/api/forward/${selectedNodeId.value}/mysql/databases`)
    if (!res.ok) throw new Error('无法连接节点')
    // If API works, it means MySQL management is available (mysql8 container exists)
    // The API returns existing databases, but here we just need to know if the service is up.
    // If the mysql8 container was missing, the backend would likely error out or return empty.
    // However, manager.js logic: listDatabases -> ensurePresenceOrCleanup -> checks dockerManager.listContainers
    // If mysql8 not found, it returns [], effectively "working" but maybe we should check container explicitly if we want strict mode.
    // For now, assume if listDatabases works, we are good to go.
    // BETTER: Use listDatabases result to see if we can connect.
    const data = await res.json()
    if (!data.success && data.message && data.message.includes('root认证失败')) {
       dbError.value = 'MySQL服务异常: root认证失败'
    }
  } catch {
    dbError.value = '无法连接到MySQL服务，请检查节点是否已安装MySQL'
  }
}

const generateDbPassword = () => {
  dbForm.value.password = generateStrongPassword(16)
}

const resetDbSetup = () => {
  dbReady.value = false
  dbResult.value = null
}

const createDatabase = async () => {
  if (!selectedNodeId.value) return
  const conf = setupConfig.value.database
  if (!conf) return

  try {
    dbCreating.value = true
    const body = {
      dbName: dbForm.value.dbName,
      userName: dbForm.value.userName,
      password: dbForm.value.password,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci'
    }
    const res = await fetch(`/api/forward/${selectedNodeId.value}/mysql/databases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '创建失败')

    // Success
    const host = conf.defaultHost || 'mysql8' // Fallback host IP
    const port = conf.defaultPort || 3306
    const urlTemplate = conf.urlTemplate || 'r2dbc:pool:mysql://{host}:{port}/{db}'
    const url = urlTemplate
      .replace('{host}', host)
      .replace('{port}', port)
      .replace('{db}', body.dbName)

    dbResult.value = {
      url,
      userName: body.userName,
      password: body.password
    }
    dbReady.value = true
    ElMessage.success('数据库创建成功')
  } catch (e) {
    ElMessage.error(e.message || '创建数据库失败')
  } finally {
    dbCreating.value = false
  }
}

const saveDatabaseConfig = () => {
  console.log('saveDatabaseConfig clicked')
  try {
    const conf = setupConfig.value.database
    if (!conf) {
      ElMessage.error('配置异常：未找到数据库配置定义')
      return
    }

    // Basic validation
    if (!dbForm.value.dbName || !dbForm.value.userName || !dbForm.value.password) {
       ElMessage.warning('请填写完整的数据库信息')
       return
    }

    const host = conf.defaultHost || 'mysql8'
    const port = conf.defaultPort || 3306
    const urlTemplate = conf.urlTemplate || 'r2dbc:pool:mysql://{host}:{port}/{db}'
    const url = urlTemplate
      .replace('{host}', host)
      .replace('{port}', port)
      .replace('{db}', dbForm.value.dbName)

    dbResult.value = {
      url,
      userName: dbForm.value.userName,
      password: dbForm.value.password
    }
    dbReady.value = true
    ElMessage.success('数据库配置已保存')
  } catch (e) {
    console.error(e)
    ElMessage.error('保存配置失败: ' + (e.message || '未知错误'))
  }
}

onMounted(() => {
  const lastIdx = versionList.value.length - 1
  if (lastIdx > 0) {
    selectedVersionIndex.value = lastIdx
  } else if (lastIdx === 0) {
    loadVersion(versionList.value[0])
  }
})

const submit = async () => {
  if (!form.value.image.trim()) { ElMessage.error('镜像不能为空'); return }
  if (!selectedNodeId.value) { ElMessage.error('请选择目标节点'); return }

  // Check setup requirements
  if (setupConfig.value.database) {
    if (dbError.value) { ElMessage.error('数据库服务异常，无法安装'); return }
    if (!dbReady.value) { ElMessage.error('请先完成数据库配置'); return }
  }

  for (const k in setupConfig.value) {
    if (k === 'database') continue
    const f = setupConfig.value[k]
    if (f.required && !setupValues.value[k]) {
      ElMessage.error(`请填写${f.label || k}`)
      return
    }
  }

  // Merge Setup Envs
  const finalEnvs = [...envs.value]

  // 1. Database Envs
  if (setupConfig.value.database && dbReady.value && dbResult.value) {
    const conf = setupConfig.value.database
    const map = conf.env || {}
    if (map.url) finalEnvs.push({ name: map.url, value: dbResult.value.url })
    if (map.username) finalEnvs.push({ name: map.username, value: dbResult.value.userName })
    if (map.password) finalEnvs.push({ name: map.password, value: dbResult.value.password })

    // Platform specific envs
    if (conf.platformEnv) {
      finalEnvs.push({ name: conf.platformEnv.name, value: conf.platformEnv.value })
    }
  }

  // 2. Generic Envs
  for (const k in setupConfig.value) {
    if (k === 'database') continue
    const f = setupConfig.value[k]
    const val = setupValues.value[k]
    if (f.env && val) {
      finalEnvs.push({ name: f.env, value: val })
    }
  }

  const parseCmdText = (text) => {
    const t = String(text || '').trim()
    if (!t) return []
    const parts = t.match(/"[^"]*"|'[^']*'|\S+/g) || []
    return parts.map(s => s.replace(/^['"]|['"]$/g, ''))
  }
  const prefixWithName = (p) => {
    return normalizeHostPath(p)
  }
  const cmdParts = parseCmdText(form.value.cmdText)
  const volumePathTypes = Object.fromEntries(
    volumes.value
      .filter(v => v.container && v.type === 'file')
      .map(v => [String(v.container).trim(), 'file'])
  )
  const config = {
    image: form.value.image.trim(),
    name: form.value.name.trim() || undefined,
    cmd: cmdParts.length ? cmdParts : undefined,
    env: finalEnvs.filter(e => e.name && e.value).map(e => ({ name: e.name, value: e.value })),
    ports: Object.fromEntries(ports.value.filter(p => p.container && p.host).map(p => [String(p.container).trim(), Number(p.host)])),
    volumes: Object.fromEntries(volumes.value.filter(v => v.container && v.host).map(v => [prefixWithName(String(v.host).trim(), form.value.name.trim()), String(v.container).trim()])),
    volumePathTypes: Object.keys(volumePathTypes).length ? volumePathTypes : undefined,
    networkMode: networkMode.value === 'host' ? 'host' : undefined,
    networks: networkMode.value === 'host' ? [] : ['xmp-network'],
    publicAccess: isPublic.value
  }
  try {
    loading.value = true
    const url = `/api/forward/${selectedNodeId.value}/docker/containers/async`
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '创建容器任务失败')
    const taskId = data && data.data && data.data.taskId ? data.data.taskId : ''
    ElMessage.success(taskId ? `任务已创建：${taskId}` : '任务已创建')
    emit('submit', { config, taskId })
    close()
  } catch (e) {
    ElMessage.error(e.message || '创建容器任务失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
@import '@/assets/styles/modal-common.css';
.modal-container { width: 900px; max-width: 95vw; height: 85vh; max-height: 820px; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 24px 0 24px; margin-bottom: 15px; }
.modal-header > div:first-child { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.modal-header > div:first-child h2 { margin: 0; color: var(--el-text-color-primary); font-size: 18px; }
.modal-body { flex: 1; overflow-y: auto; padding: 0 24px 24px 24px; }

.container-banner { display: flex; align-items: center; gap: 16px; background: linear-gradient(to right, var(--el-color-primary-light-9), var(--el-fill-color-dark)); border: 1px solid var(--el-color-primary-light-8); border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; }
.banner-icon { width: 42px; height: 42px; border-radius: 10px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: var(--el-box-shadow-light); }
.banner-content { display: flex; flex-direction: column; gap: 4px; }
.banner-label { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 500; }
.banner-value { font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); font-family: 'Monaco', 'Menlo', monospace; letter-spacing: 0.5px; }

.content-wrapper { display: flex; flex-direction: column; gap: 16px; }
.section { display: flex; flex-direction: column; gap: 16px; background: var(--el-fill-color-lighter); border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 20px; transition: border-color 0.3s; }
.section:hover { border-color: var(--el-color-primary-light-5); }
.section-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { margin: 0; color: var(--el-text-color-primary); font-size: 14px; display: flex; align-items: center; gap: 8px; }
.section-title i { color: var(--el-color-primary); font-size: 13px; }
.section-content { display: flex; flex-direction: column; gap: 12px; }

.version-select-row { display: flex; align-items: center; gap: 16px; }
.version-select { flex: 1; max-width: 300px; background: var(--el-fill-color-light); border: 1px solid var(--el-border-color); color: var(--el-text-color-primary); border-radius: 8px; padding: 8px 12px; font-size: 14px; outline: none; transition: all 0.2s; }
.version-select:focus { border-color: var(--el-color-primary); box-shadow: 0 0 0 2px var(--el-color-primary-light-9); }

.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.form-item { display: flex; flex-direction: column; gap: 6px; }
.label { color: var(--el-text-color-regular); font-size: 12px; font-weight: 500; }
.input { background: var(--el-input-bg-color); border: 1px solid var(--el-border-color); color: var(--el-text-color-primary); border-radius: 6px; padding: 8px 12px; font-size: 13px; transition: all 0.2s; }
.input:focus { border-color: var(--el-color-primary); outline: none; box-shadow: 0 0 0 2px var(--el-color-primary-light-9); }
.input.small { width: 140px; }
.input.medium { width: 260px; }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; }
.arrow { color: var(--el-text-color-secondary); }
.muted { color: var(--el-text-color-secondary); font-size: 13px; padding-left: 2px; }
.modal-footer { display: flex; flex-direction: column; gap: 10px; padding: 0 24px 24px 24px; }
.action-row { display: flex; gap: 10px; justify-content: flex-end; }
.btn { background: var(--el-button-bg-color); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.btn:hover:not(:disabled) { background: var(--el-button-hover-bg-color); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { background: var(--el-color-primary); border-color: var(--el-color-primary); color: var(--el-color-white); }
.btn.primary:hover:not(:disabled) { background: var(--el-color-primary-light-3); }
.mini-btn { background: var(--el-button-bg-color); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color); padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.2s; }
.mini-btn:hover:not(:disabled) { background: var(--el-button-hover-bg-color); color: var(--el-color-primary); }
.mini-btn.danger { color: var(--el-color-danger); border-color: var(--el-color-danger-light-5); }
.mini-btn.danger:hover:not(:disabled) { background: var(--el-color-danger-light-9); }
.loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--el-text-color-secondary); }
.loading-spinner { width: 40px; height: 40px; border: 4px solid var(--el-border-color-extra-light); border-radius: 50%; border-top-color: var(--el-color-primary); animation: spin 1s ease-in-out infinite; margin-bottom: 15px; }
@keyframes spin { to { transform: rotate(360deg); } }
.alert-danger { background: var(--el-color-danger-light-9); border: 1px solid var(--el-color-danger-light-7); color: var(--el-color-danger); padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.alert-danger.small { padding: 8px; font-size: 12px; margin-top: 8px; }
.alert-warning { background: var(--el-color-warning-light-9); border: 1px solid var(--el-color-warning-light-7); color: var(--el-color-warning); padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 13px; }

/* Setup Fields Styles */
.setup-field-group { margin-bottom: 20px; }
.setup-field-group:last-child { margin-bottom: 0; }
.generic-setup-field .required-mark { color: var(--el-color-danger); margin-left: 4px; }
.input-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; line-height: 1.4; }

.database-setup-card {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 8px;
  padding: 16px;
}

.setup-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.setup-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.setup-label i { color: var(--el-color-primary); }

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}
.status-badge.status-pending { background: var(--el-color-info-light-9); color: var(--el-color-info); }
.status-badge.status-ready { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.status-badge.status-error { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }

.database-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-with-btn {
  display: flex;
  gap: 8px;
}
.input-with-btn .input { flex: 1; }

.action-row-left {
  display: flex;
  justify-content: flex-start;
  margin-top: 4px;
}

.database-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--el-fill-color);
  padding: 12px;
  border-radius: 6px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.info-label { color: var(--el-text-color-secondary); min-width: 60px; }
.info-value { color: var(--el-text-color-primary); font-family: monospace; }
.btn.small { padding: 6px 12px; font-size: 13px; }
.mini-btn.text { border: none; background: transparent; color: var(--el-text-color-secondary); padding: 0 4px; }
.mini-btn.text:hover { color: var(--el-text-color-primary); background: transparent; text-decoration: underline; }
</style>
