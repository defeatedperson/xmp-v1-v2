<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'edit' ? '编辑计划任务' : '创建计划任务'"
    width="500px"
    @close="handleClose"
    @open="handleOpen"
    destroy-on-close
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="top"
    >
      <el-form-item label="任务名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="请输入任务名称"
          maxlength="5"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="任务类型" prop="type">
        <el-radio-group v-model="form.type" @change="handleTypeChange">
          <el-radio-button label="website">网站</el-radio-button>
          <el-radio-button label="database">数据库</el-radio-button>
          <el-radio-button label="container">应用容器</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="任务目标" prop="target">
        <el-select
          v-model="form.target"
          placeholder="请选择任务目标"
          style="width: 100%"
          :loading="loadingTargets"
        >
          <el-option
            v-for="item in targetOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="本地保留份数" prop="localCopies">
            <el-input-number v-model="form.localCopies" :min="1" :max="99" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="上传到对象存储" prop="remoteEnabled">
            <el-switch v-model="form.remoteEnabled" active-text="开启" inactive-text="关闭" />
          </el-form-item>
        </el-col>
      </el-row>

      <template v-if="form.remoteEnabled">
        <el-form-item label="远端保留份数" prop="remoteCopies">
          <el-input-number v-model="form.remoteCopies" :min="1" :max="99" style="width: 100%" />
        </el-form-item>
        <el-alert
          title="需要在“安全设置”当中配置对象存储信息"
          type="warning"
          show-icon
          :closable="false"
          style="margin-bottom: 18px"
        />
      </template>

    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          确定
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref  } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: Boolean,
  mode: {
    type: String,
    default: 'create'
  },
  task: {
    type: Object,
    default: () => ({})
  },
  nodeId: {
    type: [String, Number],
    default: ''
  }
})

const emit = defineEmits(['update:visible', 'close', 'submit'])

const formRef = ref(null)
const submitting = ref(false)
const loadingTargets = ref(false)
const targetOptions = ref([])

const form = ref({
  id: '',
  name: '',
  type: 'website',
  target: '',
  localCopies: 7,
  remoteEnabled: false,
  remoteCopies: 1
})

const rules = {
  name: [
    { required: true, message: '请输入任务名称', trigger: 'blur' },
    { pattern: /^[\u4e00-\u9fa5A-Za-z0-9_-]+$/, message: '仅支持中英文、数字、下划线和中划线', trigger: 'blur' }
  ],
  type: [{ required: true, message: '请选择任务类型', trigger: 'change' }],
  target: [{ required: true, message: '请选择任务目标', trigger: 'change' }],
  localCopies: [{ required: true, message: '请输入本地保留份数', trigger: 'change' }],
  remoteCopies: [{ required: true, message: '请输入远端保留份数', trigger: 'change' }]
}

// 数据获取方法
const api = {
  getWebsites: async (nodeId) => {
    const res = await fetch(`/api/forward/${nodeId}/sites`)
    const json = await res.json()
    return (json.data || []).map(s => ({ label: s.primaryDomain || s.name, value: s.primaryDomain }))
  },
  getDatabases: async (nodeId) => {
    const res = await fetch(`/api/forward/${nodeId}/mysql/databases`)
    const json = await res.json()
    return (json.data || []).map(d => ({ label: d.dbName, value: d.dbName }))
  },
  getContainers: async (nodeId) => {
    // 先检查连接
    const testRes = await fetch(`/api/forward/${nodeId}/docker/test-connection`)
    const testJson = await testRes.json()
    if (!testJson.success) throw new Error(testJson.message || 'Docker连接失败')

    const res = await fetch(`/api/forward/${nodeId}/docker/containers`)
    const json = await res.json()
    return (json.data || []).map(c => ({ label: c.name, value: c.name }))
  }
}

const loadTargets = async (type) => {
  if (!props.nodeId) return
  loadingTargets.value = true
  targetOptions.value = []
  try {
    if (type === 'website') {
      targetOptions.value = await api.getWebsites(props.nodeId)
    } else if (type === 'database') {
      targetOptions.value = await api.getDatabases(props.nodeId)
    } else if (type === 'container') {
      targetOptions.value = await api.getContainers(props.nodeId)
    }
  } catch (e) {
    ElMessage.error(e.message || '获取列表失败')
  } finally {
    loadingTargets.value = false
  }
}

const handleTypeChange = (val) => {
  form.value.target = ''
  loadTargets(val)
}

const handleOpen = async () => {
  // 初始化表单数据
  const t = props.task || {}
  const remoteProfileId = t.remoteProfileId || 0
  const remoteCopies = t.remoteCopies || 0

  form.value = {
    id: t.id || '',
    name: t.name || '',
    type: t.type || 'website',
    target: t.target || '',
    localCopies: t.localCopies || 7,
    remoteEnabled: remoteProfileId > 0 && remoteCopies > 0,
    remoteCopies: remoteCopies || 1
  }

  // 加载选项
  await loadTargets(form.value.type)
}

const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate((valid) => {
    if (valid) {
      const payload = {
        id: form.value.id,
        name: form.value.name,
        type: form.value.type,
        target: form.value.target,
        localCopies: form.value.localCopies,
        remoteProfileId: form.value.remoteEnabled ? 1 : 0,
        remoteCopies: form.value.remoteEnabled ? form.value.remoteCopies : 0
      }
      emit('submit', payload)
    }
  })
}
</script>

<style scoped>
/* 保持原有样式的精髓，适配 Element Plus */
</style>
