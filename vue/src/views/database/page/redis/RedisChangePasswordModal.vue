<template>
  <el-dialog
    v-model="dialogVisible"
    title="修改 Redis 密码"
    width="400px"
    destroy-on-close
    append-to-body
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="top"
      v-loading="loading"
    >
      <el-form-item label="当前密码状态">
        <el-input :model-value="currentPasswordText" disabled />
      </el-form-item>

      <el-form-item label="新密码" prop="password">
        <div class="password-input-group">
          <el-input
            v-model="form.password"
            placeholder="请输入新密码"
            show-password
          />
          <el-button type="primary" @click="generatePassword" :disabled="loading">
            生成
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          placeholder="请再次输入新密码"
          show-password
        />
      </el-form-item>

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        class="error-alert"
      />
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false" :disabled="loading">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="loading">更新</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
  hasPassword: { type: Boolean, default: false }
})

const emit = defineEmits(['update:visible', 'close', 'updated'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => {
    if (!val) {
      emit('close')
    }
    emit('update:visible', val)
  }
})

const formRef = ref(null)
const loading = ref(false)
const error = ref('')

const form = reactive({
  password: '',
  confirmPassword: ''
})

const currentPasswordText = computed(() => {
  if (!props.hasPassword) return '当前无密码或配置中未记录'
  return '已设置密码'
})

const validateConfirmPassword = (rule, value, callback) => {
  if (!value) {
    callback(new Error('请再次输入新密码'))
    return
  }
  if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
    return
  }
  callback()
}

const rules = {
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, max: 128, message: '长度在 8 到 128 个字符', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_!@#$%^&*()\-+=.:,?]{8,128}$/, message: '密码格式不合法', trigger: 'blur' }
  ],
  confirmPassword: [
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      form.password = ''
      form.confirmPassword = ''
      error.value = ''
      if (formRef.value) {
        formRef.value.clearValidate()
      }
    }
  }
)

const handleSubmit = async () => {
  if (!props.nodeId) {
    error.value = '请选择节点'
    ElMessage.error('请选择节点')
    return
  }
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    error.value = ''
    try {
      const url = `/api/forward/${props.nodeId}/redis/admin/password`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: form.password })
      })
      let result = null
      try {
        result = await resp.json()
      } catch {
        result = null
      }
      if (!resp.ok || !result || result.success === false) {
        const msg = result && result.message ? result.message : '密码更新失败'
        error.value = msg
        ElMessage.error(msg)
        return
      }
      ElMessage.success('Redis 密码更新成功')
      emit('updated')
      dialogVisible.value = false
    } catch {
      error.value = '密码更新失败'
      ElMessage.error('密码更新失败')
    } finally {
      loading.value = false
    }
  })
}

const generatePassword = () => {
  const length = 20
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+'
  const array = new Uint32Array(length)
  crypto.getRandomValues(array)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += charset[array[i] % charset.length]
  }
  form.password = result
  form.confirmPassword = result
}
</script>

<style scoped>
.password-input-group {
  display: flex;
  gap: 8px;
  width: 100%;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.error-alert {
  margin-top: 8px;
}

:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>

