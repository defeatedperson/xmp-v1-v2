<template>
  <Teleport to="body">
    <div class="modal-overlay">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <div>
          <h2>安装器</h2>
          <NodeSelector :nodeType="1" @node-selected="onNodeSelected" @error="onNodeError" />
        </div>

        <div class="header-buttons">
          <button class="close-button" @click="close" :disabled="loading">&times;</button>
        </div>
      </div>

      <div class="tabs-header">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-item"
          :class="{ active: currentTab === tab.key }"
          @click="currentTab = tab.key"
        >
          {{ tab.label }}
        </div>
      </div>

      <div class="modal-body">

        <div v-if="loading" class="loading-container">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>
        <div v-else class="content-wrapper">

          <!-- 常规配置 -->
          <div v-show="currentTab === 'general'" class="tab-pane">
            <div class="section">
              <div class="section-header">
                <h3 class="section-title"><i class="fas fa-magic"></i> 自动填充（docker命令解析）</h3>
                <button class="mini-btn" @click="showDockerParse = !showDockerParse">{{ showDockerParse ? '收起' : '展开' }}</button>
              </div>
              <div v-if="showDockerParse" class="section-content">
                <label class="form-item">
                  <span class="label">docker run 命令</span>
                  <textarea class="input" rows="5" v-model="dockerRunText" placeholder="例如：docker run -d --name my-app -p 8080:80 -v /host:/container image:tag CMD"></textarea>
                </label>
                <div class="row">
                  <button class="mini-btn" @click="parseDockerRun">解析并填充</button>
                  <div class="muted">支持 --name、-p、-v、-e、--network</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-header">
                <h3 class="section-title"><i class="fas fa-cog"></i> 基础配置</h3>
              </div>
              <div class="section-content">
                <div class="form-grid">
                  <label class="form-item">
                    <span class="label">镜像</span>
                    <input class="input" v-model="form.image" placeholder="例如 nginx:latest" />
                  </label>
                  <label class="form-item">
                    <span class="label">名称</span>
                    <input class="input" v-model="form.name" placeholder="容器名称，可留空" />
                  </label>
                </div>
                <label class="form-item">
                  <span class="label">启动命令</span>
                  <input class="input" v-model="form.cmdText" placeholder="留空使用镜像默认CMD" />
                </label>
              </div>
            </div>
          </div>

          <!-- 网络与端口 -->
          <div v-show="currentTab === 'network'" class="tab-pane">
            <div class="section">
              <div class="section-header">
                <h3 class="section-title"><i class="fas fa-plug"></i> 端口映射（右侧是外部端口）</h3>
                <button class="mini-btn" @click="addPort">添加</button>
              </div>
              <div class="section-content">
                <div class="list">
                  <div class="row" v-for="(p, idx) in ports" :key="idx">
                    <input class="input small" v-model="p.container" placeholder="容器端口" />
                    <span class="arrow">→</span>
                    <input class="input small" v-model="p.host" placeholder="主机端口" />
                    <button class="mini-btn danger" @click="removePort(idx)">删除</button>
                  </div>
                  <div v-if="ports.length === 0" class="muted">无端口映射</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-header">
                <h3 class="section-title"><i class="fas fa-network-wired"></i> 网络配置</h3>
              </div>
              <div class="section-content">
                <div class="form-grid">
                  <label class="form-item">
                    <span class="label">网络模式</span>
                    <select class="input" v-model="networkMode">
                      <option value="default">默认（xmp-network）</option>
                      <option value="host">host</option>
                      <option value="custom">自定义</option>
                    </select>
                  </label>
                  <label v-if="networkMode !== 'host'" class="form-item">
                    <span class="label">网络名称</span>
                    <input
                      class="input"
                      v-model="networkNames"
                      :disabled="networkMode !== 'custom'"
                      :placeholder="networkMode === 'custom' ? '多个用逗号分隔' : '固定为 xmp-network'"
                    />
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
                  <div class="muted" v-if="!isPublic">未开启公网访问：无法通过外网访问，仅内网通信</div>
                </div>
                <div class="alert-danger" v-if="isPublic">
                  <i class="fas fa-exclamation-triangle"></i>
                  已开启公网访问：请谨慎将运行环境公开，示例：php、mysql、redis
                </div>
              </div>
            </div>
            <div class="section" v-else>
              <div class="muted">Host 网络模式下访问控制不可用，服务将随宿主机网络暴露</div>
            </div>
          </div>

          <!-- 存储挂载 -->
          <div v-show="currentTab === 'storage'" class="tab-pane">
            <div class="section">
              <div class="section-header">
                <h3 class="section-title"><i class="fas fa-hdd"></i> 卷挂载</h3>
                <button class="mini-btn" @click="addVolume">添加</button>
              </div>
              <div class="section-content">
                <div class="list">
                  <div class="row" v-for="(v, idx) in volumes" :key="idx">
                    <input class="input medium" v-model="v.container" placeholder="容器路径，例如 /data/logs" />
                    <span class="arrow">←→</span>
                    <input class="input medium" v-model="v.host" placeholder="主机路径或相对路径，例如 logs" />
                    <select class="input small" v-model="v.type">
                      <option value="dir">目录</option>
                      <option value="file">文件</option>
                    </select>
                    <button class="mini-btn danger" @click="removeVolume(idx)">删除</button>
                  </div>
                  <div v-if="volumes.length === 0" class="muted">无挂载</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 环境变量 -->
          <div v-show="currentTab === 'env'" class="tab-pane">
            <div class="section">
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
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <div class="action-row">
          <button class="btn" @click="close" :disabled="loading">取消</button>
          <button class="btn primary" @click="submit" :disabled="loading">创建容器</button>
        </div>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import NodeSelector from '@/components/NodeSelector.vue'
import ToggleButton from '@/components/ToggleButton.vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['close', 'submit'])

const loading = ref(false)
const selectedNodeId = ref('')
const form = ref({ image: '', name: '', cmdText: '' })
const ports = ref([])
const volumes = ref([])
const envs = ref([])
const networkMode = ref('default')
const networkNames = ref('xmp-network')
const isPublic = ref(false)

const currentTab = ref('general')
const tabs = [
  { key: 'general', label: '常规配置' },
  { key: 'network', label: '网络与端口' },
  { key: 'storage', label: '存储挂载' },
  { key: 'env', label: '环境变量' }
]

const showDockerParse = ref(false)
const dockerRunText = ref('')

const addPort = () => { ports.value.push({ container: '', host: '' }) }
const removePort = (i) => { ports.value.splice(i, 1) }
const addVolume = () => { volumes.value.push({ container: '', host: '', type: 'dir' }) }
const removeVolume = (i) => { volumes.value.splice(i, 1) }
const addEnv = () => { envs.value.push({ name: '', value: '' }) }
const removeEnv = (i) => { envs.value.splice(i, 1) }

const close = () => { if (!loading.value) emit('close') }
const onNodeSelected = (node) => { selectedNodeId.value = node && node.id ? String(node.id) : '' }
const onNodeError = (msg) => { ElMessage.error(msg || '选择节点失败') }

const parseDockerRun = () => {
  const raw = dockerRunText.value || ''
  const text = raw.replace(/\\\s*\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) { ElMessage.error('请输入 docker run 命令'); return }
  let s = text.replace(/^sudo\s+/i, '')
  s = s.replace(/^docker\s+run\s+/i, '')
  const arr = s.match(/"[^"]*"|'[^']*'|\S+/g) || []
  const strip = (t) => (t || '').replace(/^['"]|['"]$/g, '')
  const normalizeHostPath = (p) => {
    let t = String(p || '').trim()
    t = t.replace(/^(\$\(pwd\)|\$\{PWD\}|\$PWD|%cd%)/i, '')
    t = t.replace(/^[\\/]+/, '')
    t = t.replace(/^\.\//, '')
    return t || String(p || '')
  }
  let name = ''
  let net = ''
  const ps = []
  const vs = []
  const es = []
  let image = ''
  const cmdParts = []
  let i = 0
  while (i < arr.length) {
    const tok = arr[i]
    if (tok === '-d' || tok === '--detach') { i++; continue }
    if (tok === '--name') { name = strip(arr[i+1] || ''); i+=2; continue }
    if (tok.startsWith('--name=')) { name = strip(tok.split('=').slice(1).join('=')); i++; continue }
    if (tok === '-p' || tok === '--publish') {
      const val = strip(arr[i+1] || '')
      i+=2
      if (val && val.includes(':')) {
        const parts = val.split(':')
        const host = parts[0]
        const container = (parts[1] || '').split('/')[0]
        if (host && container) ps.push({ host, container })
      }
      continue
    }
    if (tok.startsWith('--publish=')) {
      const val = strip(tok.split('=').slice(1).join('='))
      if (val && val.includes(':')) {
        const parts = val.split(':')
        const host = parts[0]
        const container = (parts[1] || '').split('/')[0]
        if (host && container) ps.push({ host, container })
      }
      i++; continue
    }
    if (tok === '-v' || tok === '--volume') {
      const val = strip(arr[i+1] || '')
      i+=2
      if (val && val.includes(':')) {
        const parts = val.split(':')
        const host = normalizeHostPath(parts[0])
        const container = parts[1] || ''
        if (host && container) vs.push({ host, container, type: 'dir' })
      }
      continue
    }
    if (tok.startsWith('--volume=')) {
      const val = strip(tok.split('=').slice(1).join('='))
      if (val && val.includes(':')) {
        const parts = val.split(':')
        const host = normalizeHostPath(parts[0])
        const container = parts[1] || ''
        if (host && container) vs.push({ host, container, type: 'dir' })
      }
      i++; continue
    }
    if (tok === '-e' || tok === '--env') {
      const val = strip(arr[i+1] || '')
      i+=2
      if (val && val.includes('=')) {
        const idx = val.indexOf('=')
        const k = val.slice(0, idx)
        const v = val.slice(idx+1)
        if (k && v !== undefined) es.push({ name: k, value: v })
      }
      continue
    }
    if (tok.startsWith('--env=')) {
      const val = strip(tok.split('=').slice(1).join('='))
      if (val && val.includes('=')) {
        const idx = val.indexOf('=')
        const k = val.slice(0, idx)
        const v = val.slice(idx+1)
        if (k && v !== undefined) es.push({ name: k, value: v })
      }
      i++; continue
    }
    if (tok === '--network' || tok === '--net') { net = strip(arr[i+1] || ''); i+=2; continue }
    if (tok.startsWith('--network=')) { net = strip(tok.split('=').slice(1).join('=')); i++; continue }
    if (tok.startsWith('--net=')) { net = strip(tok.split('=').slice(1).join('=')); i++; continue }
    if (tok.startsWith('-')) { i++; continue }
    if (!image) { image = strip(tok); i++; continue }
    cmdParts.push(strip(tok))
    i++
  }
  if (image) form.value.image = image
  form.value.name = name || form.value.name
  form.value.cmdText = cmdParts.join(' ')
  ports.value = ps.length ? ps.map(p => ({ container: String(p.container), host: String(p.host) })) : ports.value
  volumes.value = vs.length ? vs.map(v => ({ container: String(v.container), host: String(v.host), type: v.type || 'dir' })) : volumes.value
  envs.value = es.length ? es : envs.value
  if (net) {
    if (net.toLowerCase() === 'host') { networkMode.value = 'host' }
    else { networkMode.value = 'custom'; networkNames.value = net }
  }
  ElMessage.success('已根据命令填充表单')
}

const parseCmdText = (text) => {
  const t = String(text || '').trim()
  if (!t) return []
  const parts = t.match(/"[^"]*"|'[^']*'|\S+/g) || []
  return parts.map(s => s.replace(/^['"]|['"]$/g, ''))
}

const submit = async () => {
  if (!form.value.image.trim()) { ElMessage.error('镜像不能为空'); return }
  if (!selectedNodeId.value) { ElMessage.error('请选择目标节点'); return }
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
  const normalizeHostPath = (p) => {
    let t = String(p || '').trim()
    t = t.replace(/^[\\/]+/, '')
    t = t.replace(/^\./, '')
    return t
  }
  const prefixWithName = (p) => {
    return normalizeHostPath(p)
  }
  if (!form.value.name.trim()) {
    form.value.name = makeContainerName(form.value.image.trim())
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
    env: envs.value.filter(e => e.name && e.value).map(e => ({ name: e.name, value: e.value })),
    ports: Object.fromEntries(ports.value.filter(p => p.container && p.host).map(p => [String(p.container).trim(), Number(p.host)])),
    volumes: Object.fromEntries(volumes.value.filter(v => v.container && v.host).map(v => [prefixWithName(String(v.host).trim(), form.value.name.trim()), String(v.container).trim()])),
    volumePathTypes: Object.keys(volumePathTypes).length ? volumePathTypes : undefined,
    networkMode: networkMode.value === 'host' ? 'host' : undefined,
    networks: networkMode.value === 'custom' ? networkNames.value.split(',').map(s => s.trim()).filter(Boolean) : (networkMode.value === 'host' ? [] : ['xmp-network']),
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

.modal-container { width: 900px; max-width: 95vw; height: 75vh; max-height: 720px; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 24px 0 24px; }
.modal-header > div:first-child { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.modal-header > div:first-child h2 { margin: 0; color: var(--el-text-color-primary); font-size: 18px; }

.tabs-header { display: flex; border-bottom: 1px solid var(--el-border-color); padding: 0 24px; border-top: 1px solid var(--el-border-color); background: var(--el-fill-color-light); margin-bottom: 15px; }
.tab-item { padding: 12px 24px; cursor: pointer; color: var(--el-text-color-regular); font-size: 14px; font-weight: 500; border-bottom: 2px solid transparent; transition: all 0.2s; }
.tab-item:hover { color: var(--el-text-color-primary); background: var(--el-fill-color); }
.tab-item.active { color: var(--el-color-primary); border-bottom-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }

.modal-body { flex: 1; overflow-y: auto; padding: 0 24px 24px 24px; }

.content-wrapper { display: flex; flex-direction: column; gap: 16px; }
.tab-pane { display: flex; flex-direction: column; gap: 16px; }

.section { display: flex; flex-direction: column; gap: 16px; background: var(--el-fill-color-lighter); border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 20px; transition: border-color 0.3s; }
.section:hover { border-color: var(--el-color-primary-light-5); }

.section-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { margin: 0; color: var(--el-text-color-primary); font-size: 14px; display: flex; align-items: center; gap: 8px; }
.section-title i { color: var(--el-color-primary); font-size: 13px; }

.section-content { display: flex; flex-direction: column; gap: 12px; }

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
.muted { color: var(--el-text-color-secondary); font-size: 13px; }

.modal-footer { display: flex; flex-direction: column; gap: 10px; padding: 0 24px 24px 24px; }
.action-row { display: flex; gap: 10px; justify-content: flex-end; }

.btn { background: var(--el-button-bg-color); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color); padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
.btn:hover:not(:disabled) { background: var(--el-button-hover-bg-color); border-color: var(--el-border-color-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { background: var(--el-color-primary); border-color: var(--el-color-primary); color: var(--el-color-white); }
.btn.primary:hover:not(:disabled) { background: var(--el-color-primary-light-3); border-color: var(--el-color-primary-light-3); }

.mini-btn { background: var(--el-button-bg-color); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.mini-btn:hover:not(:disabled) { background: var(--el-button-hover-bg-color); color: var(--el-color-primary); border-color: var(--el-color-primary-light-7); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mini-btn.danger { color: var(--el-color-danger); border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); }
.mini-btn.danger:hover:not(:disabled) { background: var(--el-color-danger-light-8); border-color: var(--el-color-danger); color: var(--el-color-danger-dark-2); }

.loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--el-text-color-secondary); }
.loading-spinner { width: 40px; height: 40px; border: 4px solid var(--el-border-color-extra-light); border-radius: 50%; border-top-color: var(--el-color-primary); animation: spin 1s ease-in-out infinite; margin-bottom: 15px; }
@keyframes spin { to { transform: rotate(360deg); } }

.alert-danger { display: flex; align-items: center; gap: 8px; background: var(--el-color-danger-light-9); border: 1px solid var(--el-color-danger-light-7); color: var(--el-color-danger); padding: 10px 12px; border-radius: 8px; font-size: 12px; margin-top: 4px; }
.alert-danger i { font-size: 14px; }
</style>
