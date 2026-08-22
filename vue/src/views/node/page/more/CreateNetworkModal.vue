<template>
  <el-dialog
    v-model="visible"
    title="创建网络"
    width="500px"
    :before-close="handleClose"
    class="create-network-modal"
  >
    <el-form :model="form" label-position="top" :rules="rules" ref="formRef">
      <el-form-item label="网络名称" prop="name">
        <el-input v-model="form.name" placeholder="例如: my-network" :disabled="loading" />
      </el-form-item>

      <el-form-item label="驱动模式" prop="driver">
        <el-select v-model="form.driver" placeholder="请选择驱动模式" :disabled="loading" style="width: 100%">
          <el-option label="bridge" value="bridge" />
          <el-option label="host" value="host" />
          <el-option label="overlay" value="overlay" />
          <el-option label="macvlan" value="macvlan" />
        </el-select>
      </el-form-item>

      <el-form-item label="IPv4 子网 (可选)" prop="subnet">
        <el-input v-model="form.subnet" placeholder="例如: 172.20.0.0/16" :disabled="loading" />
      </el-form-item>

      <el-form-item label="IPv4 网关 (可选)" prop="gateway">
        <el-input v-model="form.gateway" placeholder="例如: 172.20.0.1" :disabled="loading" />
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
  driver: 'bridge',
  subnet: '',
  gateway: ''
})

const rules = {
  name: [{ required: true, message: '请输入网络名称', trigger: 'blur' }],
  driver: [{ required: true, message: '请选择驱动模式', trigger: 'change' }]
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
  form.driver = 'bridge'
  form.subnet = ''
  form.gateway = ''
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
        const response = await fetch(`/api/forward/${props.nodeId}/docker/networks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            driver: form.driver,
            ipam: (form.subnet || form.gateway)
              ? { subnet: form.subnet.trim(), gateway: form.gateway.trim() }
              : undefined,
          })
        })
        const data = await response.json()
        
        if (response.ok && data.success) {
          ElNotification({ title: '成功', message: '网络创建成功', type: 'success', duration: 3000 })
          emit('success')
          handleClose()
        } else {
          let msg = data.message || '创建网络失败'
          if (data.error) msg += ': ' + data.error
          throw new Error(msg)
        }
      } catch (e) {
        ElMessage.error(e.message || '创建网络时发生错误')
      } finally {
        loading.value = false
      }
    }
  })
}
</script>
