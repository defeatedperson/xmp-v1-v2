<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="400px"
    @close="handleClose"
    destroy-on-close
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      :disabled="mode === 'view'"
    >
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" placeholder="请输入事项标题" />
      </el-form-item>
      <el-form-item label="时间" prop="time">
        <el-date-picker
          v-model="form.time"
          type="datetime"
          placeholder="选择日期时间"
          format="YYYY-MM-DD HH:mm"
          value-format="x"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="紧急" prop="isUrgent">
        <el-switch v-model="form.isUrgent" />
      </el-form-item>
      <el-form-item label="内容" prop="content">
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="4"
          placeholder="请输入事项详细内容"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">{{ mode === 'view' ? '关闭' : '取消' }}</el-button>
        <el-button v-if="mode !== 'view'" type="primary" @click="handleSubmit">
          保存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: 'add' // add, edit, view
  },
  initialData: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue', 'save'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const title = computed(() => {
  if (props.mode === 'add') return '新增事项'
  if (props.mode === 'edit') return '修改事项'
  return '查看事项'
})

const formRef = ref(null)
const form = ref({
  title: '',
  content: '',
  time: '',
  isUrgent: false
})

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  time: [{ required: true, message: '请选择时间', trigger: 'change' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }]
}

watch(
  () => props.initialData,
  (val) => {
    if (val && Object.keys(val).length > 0) {
      form.value = { ...val }
    } else {
      form.value = {
        title: '',
        content: '',
        time: '',
        isUrgent: false
      }
    }
  },
  { immediate: true, deep: true }
)

const handleClose = () => {
  visible.value = false
}

const genId = () => {
  const r = Math.random().toString(36).slice(2, 8)
  return `${Date.now()}_${r}`
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate((valid) => {
    if (valid) {
      const payload = {
        ...form.value,
        id: form.value.id || genId(),
        time: Number(form.value.time)
      }
      emit('save', payload)
      handleClose()
    }
  })
}
</script>
