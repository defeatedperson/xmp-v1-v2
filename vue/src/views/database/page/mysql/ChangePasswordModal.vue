<template>
  <el-dialog
    v-model="dialogVisible"
    title="修改密码"
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
      <el-form-item label="数据库名称">
        <el-input v-model="form.dbName" disabled />
      </el-form-item>

      <el-form-item label="用户名">
        <el-input v-model="form.userName" disabled />
      </el-form-item>

      <el-form-item label="新密码" prop="password">
        <div class="password-input-group">
          <el-input
            v-model="form.password"
            placeholder="请输入新密码"
            show-password
          />
          <el-button type="primary" @click="generatePassword">生成</el-button>
        </div>
      </el-form-item>

      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          placeholder="请再次输入新密码"
          show-password
        />
      </el-form-item>
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
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
  database: { type: Object, default: null }
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

const form = reactive({
  dbName: '',
  userName: '',
  password: '',
  confirmPassword: ''
})

const validateConfirmPassword = (rule, value, callback) => {
  if (value === '') {
    callback(new Error('请再次输入密码'))
  } else if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 128, message: '长度在 8 到 128 个字符', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_!@#$%^&*()+=.,?-]+$/, message: '密码包含非法字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

// 监听 database 变化，填充表单
watch(() => props.visible, (val) => {
  if (val && props.database) {
    form.dbName = props.database.name || ''
    form.userName = props.database.username || ''
    form.password = ''
    form.confirmPassword = ''
    if (formRef.value) {
      formRef.value.clearValidate()
    }
  }
})

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

const handleSubmit = async () => {
  if (!formRef.value) return
  if (!props.nodeId) {
    ElMessage.warning('请选择节点')
    return
  }

  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const url = `/api/forward/${props.nodeId}/mysql/databases/${encodeURIComponent(form.dbName)}/password`
        const resp = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userName: form.userName, password: form.password })
        })

        const result = await resp.json().catch(() => ({}))

        if (resp.ok && result.success) {
          ElMessage.success('密码更新成功')
          emit('updated', result.data)
          dialogVisible.value = false
        } else {
          ElMessage.error(result.message || '更新失败')
        }
      } catch (error) {
        console.error('Change password error:', error)
        ElMessage.error('网络请求失败')
      } finally {
        loading.value = false
      }
    }
  })
}
</script>

<style scoped>
.password-input-group {
  display: flex;
  gap: 8px;
  width: 100%;
}

:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>
