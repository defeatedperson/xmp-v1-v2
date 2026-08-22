<template>
  <div class="nodejs-project-step" v-loading="loading">
    <div class="step-header">
      <div class="title">步骤一：准备 Node.js 项目目录</div>
      <div class="actions">
        <el-button :icon="Refresh" @click="refresh" :loading="loading">刷新</el-button>
        <el-button type="primary" :icon="FolderAdd" @click="openCreateDialog" :disabled="!nodeId">
          新建项目目录
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!nodeId"
      title="请先选择节点，然后再准备项目目录"
      type="info"
      show-icon
      :closable="false"
      class="hint-alert"
    />

    <div v-else class="content-area">
      <div class="summary-row">
        <span class="summary-text">
          根目录可用子目录：{{ directories.length ? `共 ${directories.length} 个` : '暂无目录' }}
        </span>
        <el-button link type="primary" @click="openFileManager" :disabled="!selectedDir">
          在文件管理中打开
        </el-button>
      </div>

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="error-alert"
      />

      <div v-if="directories.length" class="directory-list">
        <el-radio-group v-model="selectedDir" size="small" class="dir-radio-group">
          <el-radio-button
            v-for="dir in directories"
            :key="dir.name"
            :label="dir.name"
          >
            {{ dir.name }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <el-empty v-else description="暂无目录，请先创建" />

      <div v-if="selectedDir" class="selected-info">
        <el-tag type="info">已选目录：/{{ selectedDir }}</el-tag>
      </div>

      <el-alert
        v-if="selectedDir"
        type="success"
        show-icon
        :closable="false"
        class="tip-alert"
      >
        <template #title>提示</template>
        <template #default>
          <div class="tip-text">
            <span>目录名称将作为容器名称，容器挂载目录为 /app。</span>
            <span>代码请放入 {{ formatDirectory(selectedDir) }}。</span>
          </div>
        </template>
      </el-alert>

      <div v-if="selectedDir" class="config-section">
        <div class="section-title">步骤二：配置并启动容器</div>

        <el-form label-position="top" class="config-form">
          <el-form-item label="容器名称">
            <el-input :model-value="selectedDir" disabled />
          </el-form-item>

          <el-form-item label="Node.js 镜像">
            <el-select v-model="selectedImage" placeholder="请选择镜像" filterable class="full-width">
              <el-option label="defeatedperson/nodejs:v20.0.0" value="defeatedperson/nodejs:v20.0.0" />
              <el-option label="defeatedperson/nodejs:v22.0.0" value="defeatedperson/nodejs:v22.0.0" />
              <el-option label="defeatedperson/nodejs:v24.0.0" value="defeatedperson/nodejs:v24.0.0" />
              <el-option label="defeatedperson/nodejs:v25.0.0" value="defeatedperson/nodejs:v25.0.0" />
              <el-option-group v-if="localImages.length" label="本地镜像">
                <el-option v-for="img in localImages" :key="img" :label="img" :value="img" />
              </el-option-group>
            </el-select>
            <div class="field-extra">
              <el-button link type="primary" @click="loadImages" :loading="loadingImages">刷新镜像列表</el-button>
            </div>
          </el-form-item>

          <el-form-item label="启动命令">
            <el-input v-model="startupCommand" placeholder="例如: npm start" />
            <div class="field-hint">容器工作目录固定为 /app</div>
          </el-form-item>

          <el-form-item label="网络类型">
            <el-radio-group v-model="networkMode">
              <el-radio label="default">xmp-network（推荐）</el-radio>
              <el-radio label="host">Host 网络（与宿主共享端口）</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>

        <div class="submit-row">
          <el-button
            type="primary"
            :loading="creating"
            :disabled="creating || !selectedImage || !startupCommand"
            @click="createContainer"
          >
            创建并启动容器
          </el-button>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="createVisible"
      title="新建 Node.js 项目目录"
      width="480px"
      :before-close="closeCreateDialog"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item label="项目目录名称">
          <el-input v-model="newDirName" placeholder="例如: my-node-app" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeCreateDialog" :disabled="creating">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, FolderAdd } from '@element-plus/icons-vue'
import { createFileEntry, validateFileName } from '@/views/file/tools/fileCreateTool'

const props = defineProps({
  nodeId: { type: String, default: '' },
})

const router = useRouter()
const loading = ref(false)
const error = ref('')
const directories = ref([])
const selectedDir = ref('')
const createVisible = ref(false)
const creating = ref(false)
const newDirName = ref('')
const selectedImage = ref('defeatedperson/nodejs:v24.0.0')
const startupCommand = ref('npm start')
const localImages = ref([])
const loadingImages = ref(false)
const networkMode = ref('default')

const resetState = () => {
  error.value = ''
  directories.value = []
  selectedDir.value = ''
}

const loadDirectories = async () => {
  if (!props.nodeId) {
    resetState()
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`/api/forward/${props.nodeId}/file-list`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    if (!result.success) throw new Error(result.error || result.message || '获取目录列表失败')
    const list = Array.isArray(result.data) ? result.data : []
    directories.value = list.filter((item) => item && item.type === 'directory')
    if (directories.value.length) {
      const exists = directories.value.some((dir) => dir.name === selectedDir.value)
      if (!exists) selectedDir.value = directories.value[0].name
    } else {
      selectedDir.value = ''
    }
  } catch (e) {
    error.value = e.message || '加载目录列表失败'
  } finally {
    loading.value = false
  }
}

const loadImages = async () => {
  if (!props.nodeId) return
  loadingImages.value = true
  try {
    const response = await fetch(`/api/forward/${props.nodeId}/docker/images`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    if (!result.success) throw new Error(result.message || '加载镜像失败')
    const list = Array.isArray(result.data) ? result.data : []
    localImages.value = list
      .map((img) => (img && Array.isArray(img.RepoTags) ? img.RepoTags[0] : null))
      .filter(Boolean)
  } catch (e) {
    ElMessage.error(e.message || '加载镜像失败')
  } finally {
    loadingImages.value = false
  }
}

const refresh = () => {
  loadDirectories()
}

const formatDirectory = (name) => {
  if (!name) return ''
  return `/${name}/app`
}

const openFileManager = () => {
  if (!selectedDir.value) return
  router.push({ name: 'file', query: { path: formatDirectory(selectedDir.value) } })
}

const openCreateDialog = () => {
  if (!props.nodeId) {
    ElMessage.warning('请先选择节点')
    return
  }
  newDirName.value = ''
  createVisible.value = true
}

const closeCreateDialog = () => {
  if (creating.value) return
  createVisible.value = false
}

const handleCreate = async () => {
  if (creating.value) return
  const name = String(newDirName.value || '').trim()
  const validationError = validateFileName(name)
  if (validationError) {
    ElMessage.error(validationError)
    return
  }
  if (!props.nodeId) {
    ElMessage.warning('请先选择节点')
    return
  }
  creating.value = true
  try {
    const rootResult = await createFileEntry({
      nodeId: props.nodeId,
      path: '/',
      type: 'directory',
      name,
    })
    if (!rootResult.success) {
      ElMessage.error(rootResult.message || '创建目录失败')
      return
    }
    const appResult = await createFileEntry({
      nodeId: props.nodeId,
      path: `/${name}`,
      type: 'directory',
      name: 'app',
    })
    if (!appResult.success) {
      ElMessage.warning(appResult.message || 'app 子目录创建失败，请手动创建')
    }
    ElMessage.success('项目目录已创建')
    createVisible.value = false
    await loadDirectories()
    selectedDir.value = name
  } finally {
    creating.value = false
  }
}

const parseCmdText = (text, installFirst) => {
  const t = String(text || '').trim()
  if (!t) return []
  if (installFirst) {
    return ['sh', '-c', t]
  }
  const parts = t.match(/"[^"]*"|'[^']*'|\S+/g) || []
  return parts.map((s) => s.replace(/^['"]|['"]$/g, ''))
}

const buildStartupCommand = (command) => {
  const raw = String(command || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (lower.startsWith('npm install') || lower.startsWith('npm ci')) return raw
  return `npm install && ${raw}`
}

const normalizeHostPath = (p) => {
  let t = String(p || '').trim()
  t = t.replace(/^(\$\(pwd\)|\$\{PWD\}|\$PWD|%cd%)/i, '')
  t = t.replace(/^[\\/]+/, '')
  t = t.replace(/^\.\//, '')
  return t || String(p || '')
}

const createContainer = async () => {
  if (!selectedDir.value) {
    ElMessage.warning('请先选择项目目录')
    return
  }
  if (!selectedImage.value) {
    ElMessage.error('请选择镜像')
    return
  }
  if (!startupCommand.value) {
    ElMessage.error('请填写启动命令')
    return
  }
  if (!props.nodeId) {
    ElMessage.warning('请先选择节点')
    return
  }
  creating.value = true
  try {
    const cmdText = buildStartupCommand(startupCommand.value)
    const cmd = parseCmdText(cmdText, true)
    const hostPath = normalizeHostPath(`/app`)
    const config = {
      name: selectedDir.value,
      image: selectedImage.value,
      cmd: cmd.length ? cmd : undefined,
      volumes: { [hostPath]: '/app' },
      networkMode: networkMode.value === 'host' ? 'host' : undefined,
      networks: networkMode.value === 'host' ? [] : ['xmp-network'],
      publicAccess: false,
    }
    const res = await fetch(`/api/forward/${props.nodeId}/docker/containers/async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const result = await res.json()
    if (!result.success) throw new Error(result.message || '创建容器任务失败')
    ElMessage.success('容器创建任务已提交，请稍候查看状态')
  } catch (e) {
    ElMessage.error(e.message || '创建容器失败')
  } finally {
    creating.value = false
  }
}

watch(
  () => props.nodeId,
  () => {
    resetState()
    loadDirectories()
    if (props.nodeId) loadImages()
  },
  { immediate: true },
)
</script>

<style scoped>
.nodejs-project-step {
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  padding: 16px;
}

.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hint-alert,
.error-alert,
.tip-alert {
  margin-bottom: 12px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.summary-text {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.directory-list {
  margin-bottom: 12px;
}

.dir-radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.selected-info {
  margin-bottom: 12px;
}

.config-section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.full-width {
  width: 100%;
}

.field-extra {
  margin-top: 6px;
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.submit-row {
  display: flex;
  justify-content: flex-end;
}

.tip-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

@media (max-width: 900px) {
  .step-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
