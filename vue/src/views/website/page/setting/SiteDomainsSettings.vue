<template>
  <div class="site-domains-settings">
    <div v-if="!site || !site.id" class="no-site-container">
      <el-empty description="请选择站点后配置域名与目录" :image-size="120" />
    </div>
    <div v-else class="settings-content">
      <el-row :gutter="20">
        <!-- 子域名设置 -->
        <el-col :xs="24" :sm="24" :md="8" class="mb-5">
          <el-card shadow="never" class="settings-card">
            <template #header>
              <div class="card-header">
                <div class="header-left">
                  <span class="title">子域名</span>
                  <el-tooltip content="每行一个域名，将与主域名一起生成 server_name" placement="top">
                    <el-icon class="info-icon"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </div>
                <el-button
                  type="primary"
                  size="small"
                  :loading="savingDomains"
                  @click="saveDomains"
                >
                  保存域名
                </el-button>
              </div>
            </template>
            <div class="card-body">

              <el-input
                v-model="domainText"
                type="textarea"
                :rows="6"
                placeholder="每行一个额外的子域名"
                spellcheck="false"
                class="domain-textarea mb-4"
              />
              <div class="info-text mb-2">主域名：<span class="mono">{{ primaryDomain }}</span></div>
              <div v-if="domainError" class="error-msg">
                <el-alert :title="domainError" type="error" :closable="false" show-icon />
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- 站点备注 -->
        <el-col :xs="24" :sm="24" :md="8" class="mb-5">
          <el-card shadow="never" class="settings-card">
            <template #header>
              <div class="card-header">
                <span class="title">站点备注</span>
                <el-button
                  type="primary"
                  size="small"
                  :loading="savingRemark"
                  @click="saveRemark"
                >
                  保存备注
                </el-button>
              </div>
            </template>
            <div class="card-body">
              <el-input
                v-model="remarkText"
                type="textarea"
                :rows="6"
                placeholder="用于说明站点用途，仅在面板中展示"
                class="remark-textarea"
              />
            </div>
          </el-card>
        </el-col>

        <!-- 工作目录 -->
        <el-col :xs="24" :sm="24" :md="8" class="mb-5">
          <el-card shadow="never" class="settings-card">
            <template #header>
              <div class="card-header">
                <span class="title">工作目录</span>
                <el-button
                  type="primary"
                  size="small"
                  :loading="savingWorkDir"
                  @click="saveWorkDir"
                >
                  保存目录
                </el-button>
              </div>
            </template>
            <div class="card-body">
              <div class="form-item mb-4">
                <div class="label mb-2">工作子目录</div>
                <el-input
                  v-model="workDirText"
                  placeholder="/ 表示站点根目录，例如 /test 或 /blog"
                />
              </div>
              <div class="hint-text mb-4">
                当前完整路径：
                <div class="mono-path mt-1">
                  /openresty/website/{{ primaryDomain }}{{ effectiveWorkDirPath }}
                </div>
              </div>
              <div v-if="workDirError" class="error-msg">
                <el-alert :title="workDirError" type="error" :closable="false" show-icon />
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { parseDomainList, toAsciiDomainList } from '@/utils/domain'

const props = defineProps({
  site: {
    type: Object,
    default: null,
  },
  nodeId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['refresh'])

const domainText = ref('')
const domainError = ref('')
const savingDomains = ref(false)

const remarkText = ref('')
const savingRemark = ref(false)

const workDirText = ref('/')
const workDirError = ref('')
const savingWorkDir = ref(false)

const primaryDomain = computed(() => {
  if (!props.site) return ''
  return props.site.primaryDomain || props.site.id || ''
})

const effectiveWorkDirPath = computed(() => {
  const text = String(workDirText.value || '').trim()
  if (!text || text === '/') return ''
  let v = text
  if (!v.startsWith('/')) v = '/' + v
  return v
})

const initFromSite = () => {
  const site = props.site
  if (!site || !site.id) {
    domainText.value = ''
    remarkText.value = ''
    workDirText.value = '/'
    domainError.value = ''
    workDirError.value = ''
    return
  }
  const cfg = site.config && typeof site.config === 'object' ? site.config : {}
  const primary = site.primaryDomain || site.id || ''
  const extra = []
  const seen = new Set()
  const add = (v) => {
    const s = String(v || '').trim()
    if (!s) return
    if (!primary || s.toLowerCase() === primary.toLowerCase()) return
    if (seen.has(s.toLowerCase())) return
    seen.add(s.toLowerCase())
    extra.push(s)
  }
  if (Array.isArray(cfg.serverNames)) {
    for (const v of cfg.serverNames) add(v)
  }
  if (Array.isArray(cfg.domains)) {
    for (const v of cfg.domains) add(v)
  }
  if (cfg.serverName) {
    add(cfg.serverName)
  }
  domainText.value = extra.join('\n')
  remarkText.value = String(site.remark || cfg.remark || '')
  if (cfg.workDir) {
    workDirText.value = '/' + String(cfg.workDir)
  } else {
    workDirText.value = '/'
  }
  domainError.value = ''
  workDirError.value = ''
}

const saveDomains = async () => {
  if (!props.nodeId) {
    ElMessage.error('请先选择节点')
    return
  }
  if (!props.site || !props.site.id) {
    ElMessage.error('请先选择站点')
    return
  }
  domainError.value = ''
  let asciiList = []
  try {
    const list = parseDomainList(domainText.value)
    asciiList = toAsciiDomainList(list)
    const primary = primaryDomain.value
    if (primary) {
      asciiList = asciiList.filter((d) => d.toLowerCase() !== primary.toLowerCase())
    }
  } catch (e) {
    const msg = e && e.message ? e.message : '域名格式无效'
    domainError.value = msg
    ElMessage.error(msg)
    return
  }
  savingDomains.value = true
  try {
    const domain = primaryDomain.value
    const body = {
      serverNames: [],
      serverName: '',
      domains: asciiList,
    }
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}`
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || !data.success) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    const reload = data.data && data.data.reload ? data.data.reload : null
    if (reload && reload.success === false) {
      ElMessage.error('配置保存成功但应用失败，请检查配置是否正确')
      throw new Error('配置校验失败')
    }
    ElMessage.success('域名设置已保存')
    emit('refresh')
  } catch (e) {
    const msg = e && e.message ? e.message : '保存域名设置失败'
    domainError.value = msg
    ElMessage.error(msg)
  } finally {
    savingDomains.value = false
  }
}

const saveRemark = async () => {
  if (!props.nodeId) {
    ElMessage.error('请先选择节点')
    return
  }
  if (!props.site || !props.site.id) {
    ElMessage.error('请先选择站点')
    return
  }
  savingRemark.value = true
  try {
    const domain = primaryDomain.value
    const body = {
      remark: String(remarkText.value || '').trim(),
    }
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}`
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || !data.success) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    const reload = data.data && data.data.reload ? data.data.reload : null
    if (reload && reload.success === false) {
      ElMessage.error('配置保存成功但应用失败，请检查配置是否正确')
      throw new Error('配置校验失败')
    }
    ElMessage.success('备注已保存')
    emit('refresh')
  } catch (e) {
    const msg = e && e.message ? e.message : '保存备注失败'
    ElMessage.error(msg)
  } finally {
    savingRemark.value = false
  }
}

const saveWorkDir = async () => {
  if (!props.nodeId) {
    ElMessage.error('请先选择节点')
    return
  }
  if (!props.site || !props.site.id) {
    ElMessage.error('请先选择站点')
    return
  }
  workDirError.value = ''
  const raw = String(workDirText.value || '').trim()
  let workDir = ''
  if (!raw || raw === '/') {
    workDir = ''
  } else {
    if (raw.includes('.')) {
      const msg = '工作目录不能包含 . 字符'
      workDirError.value = msg
      ElMessage.error(msg)
      return
    }
    workDir = raw
  }
  savingWorkDir.value = true
  try {
    const domain = primaryDomain.value
    const body = {
      workDir,
    }
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}`
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || !data.success) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    const reload = data.data && data.data.reload ? data.data.reload : null
    if (reload && reload.success === false) {
      ElMessage.error('配置保存成功但应用失败，请检查配置是否正确')
      throw new Error('配置校验失败')
    }
    ElMessage.success('工作目录已保存')
    emit('refresh')
  } catch (e) {
    const msg = e && e.message ? e.message : '保存工作目录失败'
    workDirError.value = msg
    ElMessage.error(msg)
  } finally {
    savingWorkDir.value = false
  }
}

watch(
  () => props.site,
  () => {
    initFromSite()
  },
  { immediate: true },
)
</script>

<style scoped>
.site-domains-settings {
  margin-top: 16px;
}

.no-site-container {
  padding: 40px;
  background: var(--el-fill-color-blank);
  border-radius: 12px;
  border: 1px dashed var(--el-border-color);
}

.settings-content {
  padding: 4px;
}

.settings-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.settings-card :deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.settings-card :deep(.el-card__body) {
  padding: 20px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header .title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header .title::before {
  content: '';
  width: 3px;
  height: 14px;
  background: var(--el-color-primary);
  border-radius: 2px;
}

.info-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  cursor: help;
}

.info-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.hint-text {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.mono {
  font-family: var(--el-font-family-mono, 'JetBrains Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace);
  color: var(--el-color-primary);
  font-weight: 500;
}

.mono-path {
  font-family: var(--el-font-family-mono, 'JetBrains Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace);
  font-size: 12px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-darker);
  padding: 8px 12px;
  border-radius: 6px;
  word-break: break-all;
}

.w-full {
  width: 100%;
}

.mb-2 { margin-bottom: 8px; }
.mb-4 { margin-bottom: 16px; }
.mb-5 { margin-bottom: 20px; }
.mt-1 { margin-top: 4px; }

@media (max-width: 768px) {
  .card-header {
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>

