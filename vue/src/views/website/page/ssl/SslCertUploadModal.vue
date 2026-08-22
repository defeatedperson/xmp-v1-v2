<template>
  <el-dialog
    v-model="visibleModel"
    title="上传证书"
    :width="dialogWidth"
    destroy-on-close
    @close="handleClose"
  >
    <el-alert
      title="提示"
      type="warning"
      description="上传同名证书会覆盖现有证书。公钥证书通常包含 BEGIN CERTIFICATE，私钥通常包含 BEGIN RSA PRIVATE KEY 或 BEGIN PRIVATE KEY。"
      show-icon
      :closable="false"
      class="mb-20"
    />

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="120px"
      label-position="top"
      v-loading="actionLoading"
    >
      <div class="pem-section">
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12">
            <div class="pem-header">
              <span class="pem-title">公钥证书 (fullchain.pem)</span>
              <el-upload
                action="#"
                :auto-upload="false"
                :show-file-list="false"
                accept=".pem,.crt,.cer,.txt"
                @change="(file) => onSelectFile(file, 'publicPem')"
              >
                <el-button size="small" :icon="Document">选择文件</el-button>
              </el-upload>
            </div>
            <el-form-item prop="publicPem">
              <el-input
                v-model="form.publicPem"
                type="textarea"
                :rows="10"
                placeholder="粘贴 PEM 内容（包含 BEGIN CERTIFICATE）"
                class="code-textarea"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <div class="pem-header">
              <span class="pem-title">私钥 (privkey.pem / .key)</span>
              <el-upload
                action="#"
                :auto-upload="false"
                :show-file-list="false"
                accept=".pem,.key,.txt"
                @change="(file) => onSelectFile(file, 'privatePem')"
              >
                <el-button size="small" :icon="Key">选择文件</el-button>
              </el-upload>
            </div>
            <el-form-item prop="privatePem">
              <el-input
                v-model="form.privatePem"
                type="textarea"
                :rows="10"
                placeholder="粘贴 PEM 内容（包含 BEGIN）"
                class="code-textarea"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <div class="basic-toggle" @click="showBasicSettings = !showBasicSettings">
        <span>基础设置</span>
        <el-icon :class="{ 'is-active': showBasicSettings }"><ArrowRight /></el-icon>
      </div>

      <el-collapse-transition>
        <div v-show="showBasicSettings" class="basic-content">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12">
              <el-form-item label="证书名" prop="certName">
                <el-input v-model="form.certName" placeholder="可留空，将自动生成" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="邮箱" prop="email">
                <el-input v-model="form.email" placeholder="证书通知邮箱，可留空" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="备注" prop="remark">
            <el-input v-model="form.remark" placeholder="备注信息，可选" />
          </el-form-item>
        </div>
      </el-collapse-transition>
    </el-form>

    <template #footer>
      <el-button @click="handleClose" :disabled="actionLoading">取消</el-button>
      <el-button type="primary" @click="submitUpload" :loading="actionLoading">上传证书</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Key, ArrowRight } from '@element-plus/icons-vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'close', 'success'])

const visibleModel = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 响应式布局
const dialogWidth = ref('720px')
const updateDialogWidth = () => {
  if (window.innerWidth < 768) {
    dialogWidth.value = '95%'
  } else {
    dialogWidth.value = '720px'
  }
}

onMounted(() => {
  updateDialogWidth()
  window.addEventListener('resize', updateDialogWidth)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateDialogWidth)
})

const formRef = ref(null)
const actionLoading = ref(false)
const showBasicSettings = ref(false)

const form = ref({
  certName: '',
  email: '',
  remark: '',
  publicPem: '',
  privatePem: '',
})

const rules = {
  publicPem: [{ required: true, message: '请提供公钥证书内容', trigger: 'blur' }],
  privatePem: [{ required: true, message: '请提供私钥内容', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱格式', trigger: ['blur', 'change'] }]
}

const resetState = () => {
  form.value = {
    certName: '',
    email: '',
    remark: '',
    publicPem: '',
    privatePem: '',
  }
  showBasicSettings.value = false
  if (formRef.value) formRef.value.clearValidate()
}

const handleClose = () => {
  if (actionLoading.value) return
  emit('update:visible', false)
  emit('close')
}

const readTextFromFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(file)
  })
}

const onSelectFile = async (uploadFile, field) => {
  const file = uploadFile.raw
  if (!file) return
  try {
    const txt = await readTextFromFile(file)
    form.value[field] = txt
  } catch (err) {
    ElMessage.error(err.message || '读取文件失败')
  }
}

const normalizeCertNameInput = (raw) => {
  const s = String(raw || '').trim()
  if (!s) return ''
  const replaced = s.replace(/[^a-zA-Z0-9_-]+/g, '_')
  const trimmed = replaced.replace(/^_+|_+$/g, '')
  return trimmed
}

const submitUpload = async () => {
  if (!props.nodeId) return ElMessage.warning('请先选择节点')

  try {
    await formRef.value.validate()

    const pub = form.value.publicPem.trim()
    const priv = form.value.privatePem.trim()

    if (!pub.includes('BEGIN CERTIFICATE')) {
      return ElMessage.error('公钥证书内容无效')
    }
    if (!priv.includes('BEGIN')) {
      return ElMessage.error('私钥内容无效')
    }

    const rawName = form.value.certName.trim()
    const name = normalizeCertNameInput(rawName)

    if (rawName && !name) {
      return ElMessage.error('证书名无效，请仅使用字母、数字、下划线或中划线')
    }

    actionLoading.value = true
    const resp = await fetch(`/api/forward/${props.nodeId}/website/ssl/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certName: name,
        email: form.value.email.trim(),
        remark: form.value.remark.trim(),
        publicPem: pub,
        privatePem: priv,
      }),
    })

    const data = await resp.json()
    if (resp.ok && data.success) {
      ElMessage.success('上传成功')
      emit('success', data.data || null)
      handleClose()
    } else {
      throw new Error(data.message || data.error || `HTTP ${resp.status}`)
    }
  } catch (e) {
    if (e.message) ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

watch(() => props.visible, (val) => {
  if (val) resetState()
})
</script>

<style scoped>

.mb-20 {
  margin-bottom: 20px;
}

.pem-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.pem-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.code-textarea :deep(.el-textarea__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  background-color: var(--el-fill-color-blank);
}

.basic-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-primary);
  cursor: pointer;
  margin-bottom: 16px;
  margin-top: 10px;
  font-size: 14px;
  user-select: none;
  width: fit-content;
}

.basic-toggle .el-icon {
  transition: transform 0.3s;
}

.basic-toggle .el-icon.is-active {
  transform: rotate(90deg);
}

.basic-content {
  border-top: 1px dashed var(--el-border-color-lighter);
  padding-top: 16px;
  margin-top: 8px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 4px;
}

@media (max-width: 768px) {
  :deep(.el-dialog__body) {
    padding: 15px;
  }

  .pem-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .pem-header .el-upload {
    width: 100%;
  }

  .pem-header .el-button {
    width: 100%;
  }
}
</style>
