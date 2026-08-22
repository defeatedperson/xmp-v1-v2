<template>
  <el-dialog
    v-model="visibleModel"
    title="证书查看"
    width="400px"
    destroy-on-close
    class="ssl-cert-view-modal"
    @close="handleClose"
  >
    <el-tabs v-model="activeTab" class="cert-tabs">
      <!-- Meta 信息 -->
      <el-tab-pane label="Meta 信息" name="meta" v-loading="metaLoading">
        <el-descriptions :column="1" border class="meta-descriptions">
          <el-descriptions-item v-for="row in metaRows" :key="row.key" :label="row.label">
            {{ row.value }}
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="!metaLoading && !metaRows.length" class="empty-data">
          暂无 Meta 数据
        </div>
      </el-tab-pane>

      <!-- 公钥 -->
      <el-tab-pane label="公钥" name="public" v-loading="publicLoading">
        <div class="code-container">
          <el-input
            v-model="publicPem"
            type="textarea"
            readonly
            :rows="12"
            spellcheck="false"
            class="code-textarea"
          />
          <div class="content-actions">
            <el-button :icon="CopyDocument" @click="copyToClipboard(publicPem)" :disabled="!publicPem">复制</el-button>
            <el-button :icon="Download" @click="downloadPem(publicPem, `${certName}.fullchain.pem`)" :disabled="!publicPem">下载</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 私钥 -->
      <el-tab-pane label="私钥" name="private" v-loading="privateLoading">
        <div class="code-container">
          <el-input
            v-model="privatePem"
            type="textarea"
            readonly
            :rows="12"
            spellcheck="false"
            class="code-textarea"
          />
          <div class="content-actions">
            <el-button :icon="CopyDocument" @click="copyToClipboard(privatePem)" :disabled="!privatePem">复制</el-button>
            <el-button :icon="Download" @click="downloadPem(privatePem, `${certName}.privkey.pem`)" :disabled="!privatePem">下载</el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Download } from '@element-plus/icons-vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
  certName: { type: String, default: '' },
  certDomain: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'close'])

const visibleModel = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const activeTab = ref('meta')
const metaLoading = ref(false)
const meta = ref(null)
const publicLoading = ref(false)
const publicPem = ref('')
const privateLoading = ref(false)
const privatePem = ref('')

const metaRows = computed(() => {
  if (!meta.value) return []
  const m = meta.value
  const rows = [
    { key: 'name', label: '证书名', value: m.name },
    { key: 'domains_csv', label: '域名', value: m.domains_csv },
    { key: 'email', label: '邮箱', value: m.email },
    { key: 'remark', label: '备注', value: m.remark },
    { key: 'auto_renew', label: '自动续期', value: typeof m.auto_renew === 'boolean' ? (m.auto_renew ? '是' : '否') : '' },
    { key: 'status', label: '状态', value: m.status },
    { key: 'status_updated_at', label: '状态更新时间', value: m.status_updated_at },
    { key: 'failure_count', label: '失败次数', value: m.failure_count !== undefined ? String(m.failure_count) : '' },
    { key: 'last_error', label: '最近错误', value: m.last_error },
    { key: 'not_before', label: '生效时间', value: m.not_before },
    { key: 'not_after', label: '过期时间', value: m.not_after },
  ]
  return rows.filter(r => r.value !== undefined && r.value !== null && r.value !== '')
})

const resetState = () => {
  activeTab.value = 'meta'
  meta.value = null
  publicPem.value = ''
  privatePem.value = ''
}

const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

const buildUrl = (kind) => {
  return `/api/forward/${props.nodeId}/website/ssl/certs/${encodeURIComponent(props.certName)}/${kind}`
}

const fetchData = async () => {
  if (!props.nodeId || !props.certName) return

  // 获取 Meta 信息
  metaLoading.value = true
  try {
    const resp = await fetch(buildUrl('meta'))
    const result = await resp.json()
    if (result.success) meta.value = result.data
  } catch  {
    ElMessage.error('获取 Meta 信息失败')
  } finally {
    metaLoading.value = false
  }

  // 获取公钥
  publicLoading.value = true
  try {
    const resp = await fetch(buildUrl('public'))
    const result = await resp.json()
    if (result.success) publicPem.value = result.data?.pem || ''
  } catch  {
    ElMessage.error('获取公钥失败')
  } finally {
    publicLoading.value = false
  }

  // 获取私钥
  privateLoading.value = true
  try {
    const resp = await fetch(buildUrl('private'))
    const result = await resp.json()
    if (result.success) privatePem.value = result.data?.pem || ''
  } catch  {
    ElMessage.error('获取私钥失败')
  } finally {
    privateLoading.value = false
  }
}

const copyToClipboard = async (text) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

const downloadPem = (content, filename) => {
  if (!content) return
  const blob = new Blob([content], { type: 'application/x-pem-file' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

watch(() => props.visible, (val) => {
  if (val) {
    resetState()
    fetchData()
  }
})
</script>

<style scoped>
.ssl-cert-view-modal :deep(.el-dialog__body) {
  padding-top: 10px;
}

.cert-tabs {
  margin-top: 10px;
}

.meta-descriptions {
  margin-top: 10px;
}

.code-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.code-textarea :deep(.el-textarea__inner) {
  font-family: 'Cascadia Code', 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  background-color: #1a1a1a;
  color: #d1d5db;
  border: 1px solid #333;
  padding: 16px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

.code-textarea :deep(.el-textarea__inner:hover) {
  border-color: var(--el-color-primary-light-5);
}

.content-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.empty-data {
  padding: 40px;
  text-align: center;
  color: var(--el-text-color-placeholder);
}
</style>
