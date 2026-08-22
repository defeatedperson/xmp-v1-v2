<template>
  <el-dialog
    v-model="visible"
    title="创建存储卷"
    width="500px"
    :before-close="handleClose"
    class="create-volume-modal"
  >
    <el-form :model="form" label-position="top" :rules="rules" ref="formRef">
      <el-form-item label="存储卷名称" prop="name">
        <el-input v-model="form.name" placeholder="例如: my-volume" :disabled="loading" />
      </el-form-item>

      <el-form-item label="驱动" prop="driver">
        <el-select v-model="form.driver" placeholder="请选择驱动" :disabled="loading" style="width: 100%">
          <el-option label="local" value="local" />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose" :disabled="loading">取消</el-button>
        <el-button type="primary" @click="submit" :loading="loading">确认创建</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue', 'success'])

const visible = ref(false)
const loading = ref(false)
const formRef = ref(null)

const form = reactive({
  name: '',
  driver: 'local'
})

const rules = {
  name: [{ required: true, message: '请输入存储卷名称', trigger: 'blur' }],
  driver: [{ required: true, message: '请选择驱动', trigger: 'change' }]
}

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    resetForm()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const resetForm = () => {
  form.name = ''
  form.driver = 'local'
  if (formRef.value) formRef.value.clearValidate()
}

const handleClose = () => {
  if (loading.value) return
  visible.value = false
}

const submit = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const response = await fetch(`/api/forward/${props.nodeId}/docker/volumes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            driver: form.driver
          })
        })
        const data = await response.json()
        
        if (response.ok && data.success) {
          ElNotification({ title: '成功', message: '存储卷创建成功', type: 'success', duration: 3000 })
          emit('success')
          handleClose()
        } else {
          let msg = data.message || '创建存储卷失败'
          if (data.error) msg += ': ' + data.error
          throw new Error(msg)
        }
      } catch (e) {
        ElMessage.error(e.message || '创建存储卷时发生错误')
      } finally {
        loading.value = false
      }
    }
  })
}
</script>
