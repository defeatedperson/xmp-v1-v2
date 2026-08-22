<template>
  <div class="site-custom-rule-settings">
    <div v-if="!site || !site.id" class="no-site-container">
      <el-empty description="请选择站点后查看高级规则" :image-size="120" />
    </div>
    <div v-else class="settings-content">
      <el-card class="settings-card" shadow="never">
        <template #header>
          <div class="card-header">
            <div class="header-left">
              <span class="title">高级规则</span>
              <el-tag size="small" type="info" effect="plain">custom.conf</el-tag>
            </div>
            <div class="header-right">
              <el-button
                type="success"
                size="small"
                :loading="loading"
                @click="reloadOpenResty"
              >
                让配置生效
              </el-button>
            </div>
          </div>
        </template>

        <div v-loading="loading" class="card-body">
          <!-- CDN 配置区域 -->
          <div class="setting-item mb-5">
            <div class="setting-info">
              <div class="setting-label">CDN 真实 IP 校准</div>
              <div class="setting-desc">开启后将自动在配置中添加 real_ip 相关规则。如果您的站点使用了 CDN，开启此项可校准访客真实 IP。</div>
            </div>
            <el-switch
              v-model="useCdn"
              :disabled="loading || !site || !site.id"
              inline-prompt
              active-text="开"
              inactive-text="关"
            />
          </div>

          <div v-if="error" class="mb-4">
            <el-alert :title="error" type="error" show-icon :closable="false" />
          </div>

          <div class="editor-container">
            <el-input
              v-model="content"
              type="textarea"
              :rows="18"
              :disabled="loading"
              placeholder="在此编写自定义 OpenResty/Nginx 规则，将保存到 custom.conf。"
              spellcheck="false"
              class="code-editor"
            />
            <div class="editor-footer">
              <span class="char-count">字符数: {{ contentLength }} / {{ maxLength }}</span>
            </div>
          </div>

          <div class="actions-footer mt-5">
            <div class="footer-left">
              <el-button
                type="danger"
                plain
                :disabled="loading || !hasContent"
                @click="handleClear"
              >
                清空规则
              </el-button>
            </div>
            <div class="footer-right">
              <el-button
                type="primary"
                :loading="loading"
                @click="handleSave"
              >
                保存配置
              </el-button>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

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

const loading = ref(false)
const error = ref('')
const content = ref('')
const useCdn = ref(false)
const maxLength = 50000

const contentLength = computed(() => content.value.length)

const hasContent = computed(() => content.value.trim().length > 0)

const cdnStartMark = '# xmp-cdn-start'
const cdnEndMark = '# xmp-cdn-end'

const hasCdnBlock = text => {
  if (!text) return false
  return text.includes(cdnStartMark) && text.includes(cdnEndMark)
}

const syncUseCdnFromContent = () => {
  const detected = hasCdnBlock(content.value)
  if (useCdn.value !== detected) {
    useCdn.value = detected
  }
}

const getDefaultCdnBlock = () => {
  return [
    cdnStartMark,
    '# 使用 CDN 时的真实 IP 校准配置',
    '# 当前使用 0.0.0.0/0 作为最大兼容范围，安全性较差',
    '# 如果您了解此规则，建议将 0.0.0.0/0 修改为您的 CDN 节点网段',
    'real_ip_header X-Forwarded-For;',
    'set_real_ip_from 0.0.0.0/0;',
    'real_ip_recursive on;',
    cdnEndMark,
    '',
  ].join('\n')
}

watch(useCdn, val => {
  if (loading.value) return
  if (val) {
    if (!hasCdnBlock(content.value)) {
      const prefix = content.value && !content.value.endsWith('\n') ? content.value + '\n\n' : content.value || ''
      content.value = prefix + getDefaultCdnBlock()
    }
  } else {
    if (!hasCdnBlock(content.value)) return
    const text = content.value || ''
    const startIndex = text.indexOf(cdnStartMark)
    const endIndex = text.indexOf(cdnEndMark)
    if (startIndex === -1 || endIndex === -1) return
    const endLineEndIndex = text.indexOf('\n', endIndex)
    const removeEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex + 1
    const before = text.slice(0, startIndex)
    const after = text.slice(removeEnd)
    content.value = (before + '\n' + after).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  }
})

const validateBeforeSave = () => {
  if (!props.nodeId || !props.site?.id) {
    ElMessage.error('请先选择站点和节点')
    return false
  }
  if (contentLength.value > maxLength) {
    ElMessage.error(`自定义规则内容过长，最多支持 ${maxLength} 个字符`)
    return false
  }
  return true
}

const loadContent = async () => {
  if (!props.nodeId || !props.site?.id) {
    error.value = '节点ID或站点信息缺失'
    content.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const domain = props.site.primaryDomain || props.site.id
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}/config/custom`
    const resp = await fetch(url)
    const data = await resp.json().catch(() => null)
    if (!resp.ok) {
      const msg = (data && data.message) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    if (!data || !data.success) {
      const msg = (data && data.message) || '获取高级规则失败'
      throw new Error(msg)
    }
    const result = data.data
    content.value = result && result.content ? result.content : ''
    syncUseCdnFromContent()
  } catch (e) {
    error.value = e.message || '加载高级规则失败'
    content.value = ''
  } finally {
    loading.value = false
  }
}

const saveContent = async () => {
  if (!validateBeforeSave()) return
  loading.value = true
  error.value = ''
  try {
    const domain = props.site.primaryDomain || props.site.id
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}/config/custom`
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: content.value }),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || data.success !== true) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    ElMessage.success('高级规则已保存')
    emit('refresh')
  } catch (e) {
    error.value = e.message || '保存高级规则失败'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

const handleSave = () => {
  saveContent()
}

const handleClear = async () => {
  if (!props.nodeId || !props.site?.id) {
    ElMessage.error('节点ID或站点信息缺失')
    return
  }
  try {
    await ElMessageBox.confirm('确定要清空当前高级规则并保存为空配置吗？', '确认操作', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  content.value = ''
  useCdn.value = false
  await saveContent()
}

const reloadOpenResty = async () => {
  if (!props.nodeId) {
    ElMessage.error('节点ID无效')
    return
  }
  try {
    await ElMessageBox.confirm('确定要重载 OpenResty 配置使更改生效吗？', '确认操作', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    loading.value = true
    error.value = ''
    const resp = await fetch(`/api/forward/${props.nodeId}/website/openresty/reload`, {
      method: 'POST',
    })
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok || !result || !result.success) {
      ElMessage.error(result?.message || '重载失败')
      throw new Error(result?.message || '重载失败')
    }
    ElMessage.success('OpenResty 重载成功')
  } catch (e) {
    ElMessage.error(e.message || '重载失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.site,
  newSite => {
    if (newSite) {
      loadContent()
    } else {
      content.value = ''
      error.value = ''
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.site-custom-rule-settings {
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
  justify-content: space-between;
  align-items: center;
  height: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left .title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-left .title::before {
  content: '';
  width: 3px;
  height: 14px;
  background: var(--el-color-primary);
  border-radius: 2px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.setting-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.editor-container {
  flex-grow: 1;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.el-textarea__inner) {
  background-color: var(--el-fill-color-light);
  border: none;
  color: var(--el-text-color-primary);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 16px;
  resize: vertical;
  flex-grow: 1;
}

:deep(.el-textarea__inner:focus) {
  box-shadow: none;
}

.editor-footer {
  background-color: var(--el-fill-color-light);
  padding: 6px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: flex-end;
}

.char-count {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.actions-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-right {
  display: flex;
  gap: 12px;
}

.mb-4 {
  margin-bottom: 16px;
}

.mb-5 {
  margin-bottom: 20px;
}

.mt-4 {
  margin-top: 16px;
}

.mt-5 {
  margin-top: 20px;
}

@media (max-width: 768px) {
  .card-header {
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
  }

  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .actions-footer {
    gap: 16px;
    align-items: stretch;
  }


}
</style>

