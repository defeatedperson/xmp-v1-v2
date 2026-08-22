<template>
  <el-dialog
    v-model="visibleModel"
    title="申请证书"
    width="400px"
    destroy-on-close
    @close="handleClose"
  >
    <el-alert
      title="申请须知"
      type="warning"
      description="请确保已在本平台创建对应站点，并且所有域名已正确解析到当前节点，否则证书签发可能失败。"
      show-icon
      :closable="false"
      class="mb-20"
    />

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      label-position="top"
      v-loading="actionLoading"
    >
      <el-form-item label="证书名" prop="certName">
        <el-input v-model="form.certName" placeholder="如 example.com，可留空将使用首个域名" />
      </el-form-item>

      <el-form-item label="域名列表" prop="domainsInput">
        <el-input
          v-model="form.domainsInput"
          type="textarea"
          :rows="4"
          placeholder="请输入要签发的域名，多个域名可用逗号或换行分隔"
        />
      </el-form-item>

      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" placeholder="用于提交申请，并接收到期提醒等通知" />
      </el-form-item>

      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" placeholder="备注信息，可选" />
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="form.autoRenew" label="签发后自动续签" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose" :disabled="actionLoading">取消</el-button>
      <el-button type="primary" @click="submitApply" :loading="actionLoading">提交申请</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
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

const formRef = ref(null)
const actionLoading = ref(false)

const form = ref({
  certName: '',
  domainsInput: '',
  email: '',
  remark: '',
  autoRenew: true
})

const rules = {
  domainsInput: [{ required: true, message: '请输入至少一个域名', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: ['blur', 'change'] }
  ]
}

const resetState = () => {
  form.value = {
    certName: '',
    domainsInput: '',
    email: '',
    remark: '',
    autoRenew: true
  }
  if (formRef.value) formRef.value.clearValidate()
}

const handleClose = () => {
  if (actionLoading.value) return
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

const submitApply = async () => {
  if (!props.nodeId) return ElMessage.warning('请先选择节点')

  try {
    await formRef.value.validate()

    const domainsRaw = parseDomainList(form.value.domainsInput)
    const domains = toAsciiDomainList(domainsRaw)

    if (!domains.length) return ElMessage.error('请填写至少一个有效的域名')

    const baseName = form.value.certName || domains[0]
    const finalName = normalizeCertNameInput(baseName)

    if (!finalName) return ElMessage.error('证书名无效，请仅使用字母、数字、下划线或中划线')

    actionLoading.value = true
    const resp = await fetch(`/api/forward/${props.nodeId}/website/ssl/issue-initial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certName: finalName,
        domains,
        email: form.value.email.trim(),
        remark: form.value.remark.trim(),
        autoRenew: !!form.value.autoRenew,
      }),
    })

    const result = await resp.json()
    if (result.success) {
      const taskId = result.data?.taskId ? String(result.data.taskId) : ''
      ElMessage.success(`证书申请任务已提交${taskId ? `（${taskId}）` : ''}，请前往任务中心查看进度`)
      emit('success', result.data)
      handleClose()
    } else {
      throw new Error(result.message || '申请失败')
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

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 4px;
}
</style>
