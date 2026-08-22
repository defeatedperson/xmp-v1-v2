<template>
  <el-dialog
    v-model="dialogVisible"
    title="创建数据库"
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
      <el-form-item label="数据库名称" prop="dbName">
        <el-input v-model="form.dbName" placeholder="例如: app_db" @input="handleDbNameInput" />
      </el-form-item>

      <el-form-item label="用户名" prop="userName">
        <el-input v-model="form.userName" placeholder="例如: app_user" @input="isUserNameDirty = true" />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <div class="password-input-group">
          <el-input
            v-model="form.password"
            placeholder="请输入强密码"
            show-password
          />
          <el-button type="primary" @click="generatePassword">生成</el-button>
        </div>
      </el-form-item>

      <div class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        <span>高级设置</span>
        <el-icon :class="{ 'is-active': showAdvanced }"><ArrowRight /></el-icon>
      </div>

      <el-collapse-transition>
        <div v-show="showAdvanced" class="advanced-content">
          <el-form-item label="字符集" prop="charset">
            <el-select v-model="form.charset" placeholder="请选择字符集" style="width: 100%">
              <el-option label="utf8mb4" value="utf8mb4" />
              <el-option label="utf8" value="utf8" />
              <el-option label="latin1" value="latin1" />
            </el-select>
          </el-form-item>

          <el-form-item label="排序规则" prop="collate">
            <el-input v-model="form.collate" placeholder="例如: utf8mb4_0900_ai_ci" />
          </el-form-item>
        </div>
      </el-collapse-transition>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false" :disabled="loading">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="loading">创建</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' }
})

const emit = defineEmits(['update:visible', 'close', 'created'])

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
const showAdvanced = ref(false)
const isUserNameDirty = ref(false)

const form = reactive({
  dbName: '',
  userName: '',
  password: '',
  charset: 'utf8mb4',
  collate: 'utf8mb4_0900_ai_ci'
})

const rules = {
  dbName: [
    { required: true, message: '请输入数据库名称', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '仅允许字母/数字/下划线', trigger: 'blur' }
  ],
  userName: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '仅允许字母/数字/下划线', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, max: 128, message: '长度在 8 到 128 个字符', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_!@#$%^&*()+=.,?-]+$/, message: '密码包含非法字符', trigger: 'blur' }
  ],
  charset: [{ required: true, message: '请选择字符集', trigger: 'change' }],
  collate: [{ required: true, message: '请输入排序规则', trigger: 'blur' }]
}

// 监听 visible 变化，重置表单
watch(() => props.visible, (val) => {
  if (val) {
    resetForm()
  }
})

const resetForm = () => {
  form.dbName = ''
  form.userName = ''
  form.password = ''
  form.charset = 'utf8mb4'
  form.collate = 'utf8mb4_0900_ai_ci'
  isUserNameDirty.value = false
  showAdvanced.value = false
  if (formRef.value) {
    formRef.value.clearValidate()
  }
}

const handleDbNameInput = (val) => {
  if (!isUserNameDirty.value) {
    form.userName = val
  }
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
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        // 1. 检查是否存在 (复刻旧逻辑)
        const chkResp = await fetch(`/api/forward/${props.nodeId}/mysql/databases`)
        const chkJson = await chkResp.json()
        const existingData = Array.isArray(chkJson?.data) ? chkJson.data : []

        const existsDb = existingData.some(x => x && String(x.dbName) === form.dbName)
        const existsUser = existingData.some(x => x && String(x.userName) === form.userName)

        if (existsDb) {
          ElMessage.error('数据库已存在')
          loading.value = false
          return
        }
        if (existsUser) {
          ElMessage.error('用户名已存在')
          loading.value = false
          return
        }

        // 2. 创建数据库
        const resp = await fetch(`/api/forward/${props.nodeId}/mysql/databases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })

        const result = await resp.json().catch(() => ({}))

        if (resp.ok && result.success) {
          ElMessage.success('创建成功')
          emit('created', result.data)
          dialogVisible.value = false
        } else {
          ElMessage.error(result.message || '创建失败')
        }
      } catch (error) {
        console.error('Create database error:', error)
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

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-primary);
  cursor: pointer;
  margin-bottom: 16px;
  font-size: 14px;
  user-select: none;
  width: fit-content;
}

.advanced-toggle .el-icon {
  transition: transform 0.3s;
}

.advanced-toggle .el-icon.is-active {
  transform: rotate(90deg);
}

.advanced-content {
  border-top: 1px dashed var(--el-border-color-lighter);
  padding-top: 16px;
  margin-top: 8px;
}

:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>
