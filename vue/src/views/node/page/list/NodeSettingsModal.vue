<template>
  <el-dialog
    v-model="visible"
    title="节点设置"
    width="550px"
    :before-close="handleClose"
    class="node-settings-modal"
  >
    <el-form :model="formData" label-position="top" class="settings-form">
      <el-form-item label="节点ID">
        <el-input v-model="formData.nodeId" disabled class="full-width" />
      </el-form-item>

      <el-form-item label="被控地址">
        <div class="input-row">
          <el-input
            v-model="formData.address"
            placeholder="请输入被控地址(如: 192.168.1.1:8080)"
          />
          <el-button
            type="primary"
            @click="saveAddress"
            :loading="loading"
            :disabled="!isAddressChanged"
          >保存</el-button>
        </div>
      </el-form-item>

      <el-form-item label="备注">
        <div class="input-row">
          <el-input v-model="formData.remark" placeholder="请输入节点备注" />
          <el-button
            type="primary"
            @click="saveRemark"
            :loading="loading"
            :disabled="!isRemarkChanged"
          >保存</el-button>
        </div>
      </el-form-item>

      <el-form-item label="节点类型">
        <div class="input-row">
          <el-select v-model="formData.nodeType" style="width: 100%">
            <el-option label="通用被控" value="1" />
            <el-option label="仅监控" value="2" />
            <el-option label="xcc套件" value="3" />
          </el-select>
          <el-button
            type="primary"
            @click="saveNodeType"
            :loading="loading"
            :disabled="!isNodeTypeChanged"
          >保存</el-button>
        </div>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>

<script setup>
import { ref, watch, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  node: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue', 'updated'])

const visible = ref(false)
const loading = ref(false)
const formData = reactive({
  nodeId: '',
  address: '',
  remark: '',
  nodeType: '1'
})
const originalData = reactive({})

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    initializeForm()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

watch(() => props.node, (newNode) => {
  if (visible.value && newNode) {
    initializeForm()
  }
}, { deep: true })

const initializeForm = () => {
  if (props.node) {
    formData.nodeId = props.node.id != null ? String(props.node.id) : ''
    formData.address = props.node.address || ''
    formData.remark = props.node.remark || ''
    formData.nodeType = props.node.type ? props.node.type.toString() : '1'

    Object.assign(originalData, { ...formData })
  }
}

const isAddressChanged = computed(() => formData.address !== originalData.address)
const isRemarkChanged = computed(() => formData.remark !== originalData.remark)
const isNodeTypeChanged = computed(() => formData.nodeType !== originalData.nodeType)

const handleClose = () => {
  if (loading.value) return
  visible.value = false
}

const updateField = async (field, value, originalKey) => {
  loading.value = true
  try {
    const response = await fetch('/api/node/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: Number(formData.nodeId),
        field,
        value
      })
    })

    // Check if response is ok
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    if (data.success) {
      originalData[originalKey] = value
      emit('updated', { field, value })
      ElMessage.success('保存成功')
    } else {
      ElMessage.error(data.error || data.message || '保存失败')
    }
  } catch (err) {
    console.error('Update failed:', err)
    ElMessage.error('网络请求失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

const saveAddress = () => {
  let addr = formData.address.trim()
  if (!addr) return ElMessage.warning('请输入地址')

  addr = addr.replace(/：/g, ':')
  if (!addr.includes(':')) addr += ':3008'
  formData.address = addr

  if (!/^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/.test(addr)) {
    return ElMessage.warning('地址格式不正确 (IP:Port)')
  }

  updateField('address', addr, 'address')
}

const saveRemark = () => {
  if (formData.remark.length > 10) return ElMessage.warning('备注过长')
  updateField('remark', formData.remark, 'remark')
}

const saveNodeType = () => {
  updateField('type', formData.nodeType, 'nodeType')
}
</script>

<style scoped>
.input-row {
  display: flex;
  gap: 10px;
  width: 100%;
}

.full-width {
  width: 100%;
}

/* Make sure dialog has enough space */
:deep(.el-dialog__body) {
  padding-top: 10px;
  padding-bottom: 10px;
}

.settings-form .el-form-item {
  margin-bottom: 18px;
}
</style>
