<template>
  <el-dialog
    v-model="visibleModel"
    title="自签证书"
    width="400px"
    destroy-on-close
    class="ssl-self-sign-modal"
    @close="handleClose"
  >
    <div v-loading="actionLoading">
      <el-form label-position="top">
        <el-form-item label="证书名">
          <el-input v-model="certName" placeholder="如 example.com，可留空自动生成" :disabled="actionLoading" />
        </el-form-item>

        <el-form-item label="域名列表">
          <el-input
            v-model="domainsInput"
            type="textarea"
            :rows="3"
            placeholder="每行或逗号分隔，支持通配符，如 *.example.com"
            :disabled="actionLoading"
          />
        </el-form-item>

        <div class="form-row">
          <el-form-item label="有效期（天）" class="flex-1">
            <el-input-number v-model="days" :min="1" :max="3650" style="width: 100%" :disabled="actionLoading" />
          </el-form-item>
          <el-form-item label="备注" class="flex-2">
            <el-input v-model="remark" placeholder="可选" :disabled="actionLoading" />
          </el-form-item>
        </div>

        <div class="action-bar">
          <el-button type="primary" @click="generateSelfSign" :loading="actionLoading">
            生成自签证书
          </el-button>
        </div>

        <div v-if="generated" class="generated-section">
          <el-divider content-position="left">证书内容</el-divider>
          <el-alert
            title="自签证书默认不受浏览器信任，仅用于内网或测试。上传同名证书会覆盖现有证书。"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />

          <el-form-item label="公钥证书 (fullchain.pem)">
            <el-input
              v-model="publicPem"
              type="textarea"
              :rows="6"
              readonly
              class="code-textarea"
            />
            <div class="content-actions">
              <el-button link type="primary" @click="copyText(publicPem)">复制公钥</el-button>
            </div>
          </el-form-item>

          <el-form-item label="私钥 (privkey.pem / .key)">
            <el-input
              v-model="privatePem"
              type="textarea"
              :rows="6"
              readonly
              class="code-textarea"
            />
            <div class="content-actions">
              <el-button link type="primary" @click="copyText(privatePem)">复制私钥</el-button>
            </div>
          </el-form-item>
        </div>
      </el-form>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose" :disabled="actionLoading">取消</el-button>
        <el-button type="success" @click="uploadToNode" :disabled="actionLoading || !generated">
          上传到节点
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { parseDomainList, toAsciiDomainList } from '@/utils/domain'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'close', 'success'])

const visibleModel = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const actionLoading = ref(false)
const certName = ref('')
const domainsInput = ref('')
const remark = ref('')
const days = ref(365)
const publicPem = ref('')
const privatePem = ref('')
const generated = ref(false)

const resetState = () => {
  actionLoading.value = false
  certName.value = ''
  domainsInput.value = ''
  remark.value = ''
  days.value = 365
  publicPem.value = ''
  privatePem.value = ''
  generated.value = false
}

const handleClose = () => {
  if (actionLoading.value) return
  resetState()
  emit('update:visible', false)
  emit('close')
}

const normalizeCertNameInput = (raw) => {
  const s = String(raw || '').trim()
  if (!s) return ''
  const replaced = s.replace(/[^a-zA-Z0-9_-]+/g, '_')
  const trimmed = replaced.replace(/^_+|_+$/g, '')
  return trimmed
}

const copyText = async (text) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

const generateSelfSign = async () => {
  if (!props.nodeId) {
    ElMessage.warning('请先选择节点')
    return
  }
  const domainsRaw = parseDomainList(domainsInput.value)
  const domains = toAsciiDomainList(domainsRaw)
  const rawName = String(certName.value || '').trim()
  const name = normalizeCertNameInput(rawName)
  const remarkValue = String(remark.value || '').trim()

  if (!domains.length) {
    ElMessage.error('请填写至少一个域名')
    return
  }
  if (rawName && !name) {
    ElMessage.error('证书名无效，请仅使用字母、数字、下划线或中划线')
    return
  }
  if (name && name !== certName.value) {
    certName.value = name
  }

  try {
    actionLoading.value = true
    const resp = await fetch('/api/website/ssl/self-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domains,
        certName: name || null,
        days: Number(days.value),
        remark: remarkValue || null,
      }),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || !data.success) {
      throw new Error((data && (data.message || data.error)) || `HTTP ${resp.status}`)
    }
    const d = data.data || {}
    publicPem.value = String(d.publicPem || '')
    privatePem.value = String(d.privatePem || '')
    if (d.certName) certName.value = String(d.certName)
    generated.value = !!publicPem.value && !!privatePem.value
    if (!generated.value) throw new Error('生成失败')
    ElMessage.success('生成成功')
  } catch (e) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    actionLoading.value = false
  }
}

const uploadToNode = async () => {
  if (!props.nodeId) {
    ElMessage.warning('请先选择节点')
    return
  }
  const name = String(certName.value || '').trim()
  const remarkValue = String(remark.value || '').trim()
  const pub = String(publicPem.value || '').trim()
  const priv = String(privatePem.value || '').trim()

  if (!name) {
    ElMessage.error('证书名无效')
    return
  }
  if (!pub || !pub.includes('BEGIN CERTIFICATE')) {
    ElMessage.error('公钥证书内容无效')
    return
  }
  if (!priv || !priv.includes('BEGIN')) {
    ElMessage.error('私钥内容无效')
    return
  }

  try {
    actionLoading.value = true
    const resp = await fetch(`/api/forward/${props.nodeId}/website/ssl/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certName: name,
        remark: remarkValue,
        publicPem: pub,
        privatePem: priv,
      }),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || !data.success) {
      throw new Error((data && (data.message || data.error)) || `HTTP ${resp.status}`)
    }
    ElMessage.success('上传成功')
    emit('success', data.data || null)
    handleClose()
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    actionLoading.value = false
  }
}

watch(() => props.visible, (v) => {
  if (v) resetState()
})
</script>

<style scoped>
.form-row {
  display: flex;
  gap: 16px;
}
.flex-1 { flex: 1; }
.flex-2 { flex: 2; }

.action-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
}

.generated-section {
  margin-top: 20px;
}

.code-textarea :deep(.el-textarea__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  background-color: var(--el-fill-color-blank);
}

.content-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
