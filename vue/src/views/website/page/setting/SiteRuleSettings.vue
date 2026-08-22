<template>
  <div class="site-rule-settings">
    <div v-if="!site || !site.id" class="no-site-container">
      <el-empty description="请选择站点后查看站点规则设置" :image-size="120" />
    </div>

    <div v-else class="settings-content">
      <el-row :gutter="20">
        <!-- 规则预览 -->
        <el-col :span="12" :xs="24" class="mb-5">
          <el-card class="settings-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span class="title">规则预览</span>
                <div class="preview-info">
                  <el-icon><View /></el-icon>
                  <span>只读预览</span>
                </div>
              </div>
            </template>

            <div v-loading="loading" class="card-body">
              <div class="preview-container">
                <el-result v-if="error" icon="error" :title="error" />
                <el-empty v-else-if="!ruleContent" description="暂无规则内容" :image-size="60" />
                <pre v-else class="rule-preview">{{ ruleContent }}</pre>
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- 规则设置 -->
        <el-col :span="12" :xs="24" class="mb-5">
          <el-card class="settings-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span class="title">规则设置</span>
                <el-button
                  type="primary"
                  size="small"
                  :loading="loading"
                  @click="reloadOpenResty"
                >
                  让配置生效
                </el-button>
              </div>
            </template>

            <div class="card-body">
              <el-table :data="ruleDefinitions" style="width: 100%" :show-header="true" class="rule-table">
                <el-table-column prop="label" label="规则类型" min-width="120" />
                <el-table-column label="状态" width="100">
                  <template #default="{ row }">
                    <el-tag :type="hasRule(row.key) ? 'success' : 'info'" size="small">
                      {{ hasRule(row.key) ? '已设置' : '未设置' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="160" align="right">
                  <template #default="{ row }">
                    <el-space>
                      <el-button
                        size="small"
                        plain
                        @click="openModal(row.key)"
                      >
                        {{ hasRule(row.key) ? '编辑' : '设置' }}
                      </el-button>
                      <el-button
                        v-if="hasRule(row.key)"
                        size="small"
                        type="danger"
                        plain
                        @click="clearRule(row.key, row.label)"
                      >
                        清空
                      </el-button>
                    </el-space>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <!-- Modals -->
            <RewriteRuleModal
              :visible="activeModal === 'rewrite'"
              :node-id="nodeId"
              :site="site"
              :existing-content="ruleContent"
              @close="closeModal"
              @saved="handleContentSaved"
            />
            <ProxyRuleModal
              :visible="activeModal === 'proxy'"
              :node-id="nodeId"
              :site="site"
              :existing-content="ruleContent"
              @close="closeModal"
              @saved="handleContentSaved"
            />
            <RedirectRuleModal
              :visible="activeModal === 'redirect'"
              :node-id="nodeId"
              :site="site"
              :existing-content="ruleContent"
              @close="closeModal"
              @saved="handleContentSaved"
            />
            <CcRuleModal
              :visible="activeModal === 'cc'"
              :node-id="nodeId"
              :site="site"
              :existing-content="ruleContent"
              @close="closeModal"
              @saved="handleContentSaved"
            />
            <BlacklistUrlRuleModal
              :visible="activeModal === 'blacklist_url'"
              :node-id="nodeId"
              :site="site"
              :existing-content="ruleContent"
              @close="closeModal"
              @saved="handleContentSaved"
            />
            <BlacklistIpRuleModal
              :visible="activeModal === 'blacklist_ip'"
              :node-id="nodeId"
              :site="site"
              :existing-content="ruleContent"
              @close="closeModal"
              @saved="handleContentSaved"
            />
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { View } from '@element-plus/icons-vue'
import RewriteRuleModal from './rules/RewriteRuleModal.vue'
import ProxyRuleModal from './rules/ProxyRuleModal.vue'
import RedirectRuleModal from './rules/RedirectRuleModal.vue'
import CcRuleModal from './rules/CcRuleModal.vue'
import BlacklistUrlRuleModal from './rules/BlacklistUrlRuleModal.vue'
import BlacklistIpRuleModal from './rules/BlacklistIpRuleModal.vue'

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
const ruleContent = ref('')
const activeModal = ref(null)

const ruleDefinitions = [
  { key: 'rewrite', label: '伪静态规则' },
  { key: 'proxy', label: '反向代理' },
  { key: 'redirect', label: '重定向' },
  { key: 'cc', label: '智能 CC防护' },
  { key: 'blacklist_url', label: '黑名单 URL' },
  { key: 'blacklist_ip', label: '黑名单 IP' },
]

const hasRule = (key) => {
  if (!ruleContent.value) return false
  return ruleContent.value.includes(`# xmp-${key}-start`)
}

const loadRules = async () => {
  if (!props.nodeId || !props.site?.id) {
    error.value = '节点ID或站点ID缺失'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const domain = props.site.primaryDomain || props.site.id
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}/config/official`

    const resp = await fetch(url)
    const data = await resp.json().catch(() => null)

    if (!resp.ok) {
      const msg = (data && data.message) || `HTTP ${resp.status}`
      throw new Error(msg)
    }

    if (!data || !data.success) {
      const msg = (data && data.message) || '获取规则配置失败'
      throw new Error(msg)
    }

    const result = data.data
    ruleContent.value = result && result.content ? result.content : ''
  } catch (e) {
    error.value = e.message || '加载规则配置失败'
    ruleContent.value = ''
  } finally {
    loading.value = false
  }
}

const openModal = (key) => {
  if (!props.site?.id || !props.nodeId) {
    ElMessage.error('请先选择站点和节点')
    return
  }
  activeModal.value = key
}

const closeModal = () => {
  activeModal.value = null
}

const handleContentSaved = (payload) => {
  if (payload && payload.content !== undefined) {
    ruleContent.value = payload.content
  } else {
    loadRules()
  }
  emit('refresh')
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

const clearRule = async (key, label) => {
  if (!props.nodeId || !props.site?.id) {
    ElMessage.error('节点ID或站点信息缺失')
    return
  }
  try {
    await ElMessageBox.confirm(`确定要清除当前${label}吗？`, '确认操作', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  const startTag = `# xmp-${key}-start`
  const endTag = `# xmp-${key}-end`
  const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}\\s*`, 'g')
  const newContent = ruleContent.value.replace(regex, '').trim()

  try {
    loading.value = true
    const domain = props.site.primaryDomain || props.site.id
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}/config/official`
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: newContent }),
    })
    let data = null
    try {
      data = await resp.json()
    } catch {
      data = null
    }
    if (!resp.ok || !data || data.success !== true) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    ElMessage.success(`${label}已清除`)
    ruleContent.value = newContent
    emit('refresh')
  } catch (e) {
    ElMessage.error(e.message || `清除${label}失败`)
    await loadRules()
  } finally {
    loading.value = false
  }
}

watch(
  () => props.site,
  (newSite) => {
    if (newSite) {
      loadRules()
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.site-rule-settings {
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

.preview-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.preview-container {
  flex-grow: 1;
  min-height: 300px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.rule-preview {
  padding: 16px;
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 600px;
  overflow-y: auto;
}

.rule-table {
  background: transparent !important;
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
}

.mb-5 {
  margin-bottom: 20px;
}

@media (max-width: 768px) {
  .card-header {
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>

