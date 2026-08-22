<template>
  <el-dialog
    v-model="visible"
    title="添加节点"
    width="500px"
    :before-close="handleClose"
    destroy-on-close
  >
    <el-form :model="formData" :rules="rules" ref="formRef" label-position="top">
      <el-form-item label="节点ID" prop="nodeId">
        <el-input v-model.number="formData.nodeId" placeholder="请输入节点ID（正整数）" type="number" />
      </el-form-item>

      <el-form-item label="被控地址" required class="address-group">
        <el-row :gutter="10" style="width: 100%">
          <el-col :span="16">
            <el-form-item prop="ip">
              <el-input v-model="formData.ip" placeholder="IP或域名" />
            </el-form-item>
          </el-col>
          <el-col :span="1" class="colon">:</el-col>
          <el-col :span="7">
            <el-form-item prop="port">
              <el-input v-model.number="formData.port" placeholder="端口" type="number" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="form-tip">
          <el-icon><InfoFilled /></el-icon> 添加后，点击【安装】可获取节点安装信息
        </div>
      </el-form-item>

      <el-form-item label="备注" prop="remark">
        <el-input v-model="formData.remark" placeholder="请输入节点备注(可选)" />
      </el-form-item>

      <el-form-item label="节点类型" prop="nodeType">
        <el-select v-model="formData.nodeType" placeholder="请选择节点类型" style="width: 100%">
          <el-option label="通用被控" value="1" />
          <el-option label="仅监控" value="2" />
          <el-option label="xcc套件" value="3" />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="loading">添加</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, reactive } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'success'])

const visible = ref(false)
const loading = ref(false)
const formRef = ref(null)

const formData = reactive({
  nodeId: '',
  ip: '',
  port: '',
  remark: '',
  nodeType: '1'
})

const rules = {
  nodeId: [
    { required: true, message: '请输入节点ID', trigger: 'blur' },
    { type: 'number', message: '节点ID必须为数字', trigger: 'blur' },
    { validator: (rule, value, callback) => {
      if (value < 1 || !Number.isInteger(value)) {
        callback(new Error('必须为正整数'))
      } else {
        callback()
      }
    }, trigger: 'blur' }
  ],
  ip: [
    { required: true, message: '请输入IP', trigger: 'blur' }
  ],
  port: [
    { required: true, message: '请输入端口', trigger: 'blur' },
    { type: 'number', message: '端口必须为数字', trigger: 'blur' }
  ],
  remark: [
    { max: 10, message: '备注长度不能超过10个字符', trigger: 'blur' }
  ],
  nodeType: [
    { required: true, message: '请选择节点类型', trigger: 'change' }
  ]
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

const handleClose = () => {
  visible.value = false
}

const resetForm = () => {
  if (formRef.value) formRef.value.resetFields()
  formData.nodeId = ''
  formData.ip = ''
  formData.port = Math.floor(Math.random() * (65535 - 10000 + 1) + 10000)
  formData.remark = ''
  formData.nodeType = '1'
}

const submitForm = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (valid) {
      const address = `${formData.ip.trim()}:${formData.port}`
      // Validate address format loosely
      if (!/^[^:]+:\d{1,5}$/.test(address)) {
        ElMessage.error('地址格式不正确')
        return
      }

      loading.value = true
      try {
        const response = await fetch('/api/node/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: Number(formData.nodeId),
            address: address,
            remark: formData.remark,
            type: formData.nodeType
          })
        })

        const data = await response.json()

        if (data.success) {
          ElMessage.success('节点添加成功')
          emit('success', data)
          handleClose()
        } else {
          ElMessage.error(data.error || data.message || '添加失败')
        }
      } catch {
        ElMessage.error('网络请求失败')
      } finally {
        loading.value = false
      }
    }
  })
}
</script>

<style scoped>
.colon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  padding-top: 5px; /* Adjust alignment */
}
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
}
.address-group {
  margin-bottom: 22px;
}
</style>
