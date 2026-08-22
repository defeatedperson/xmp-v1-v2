<template>
  <el-dialog
    v-model="visible"
    title="安装 PHP 环境"
    width="400px"
    :close-on-click-modal="false"
    :before-close="handleClose"
    destroy-on-close
  >
    <el-alert
      title="容器名必须是 php + 2位数字，例如 php84"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 20px"
    />

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="top"
      v-loading="versionsLoading"
    >
      <el-form-item label="PHP 版本" prop="selectedVersion">
        <el-select
          v-model="form.selectedVersion"
          placeholder="请选择版本"
          style="width: 100%"
          :disabled="loading || phpVersions.length === 0"
          @change="handleVersionChange"
        >
          <el-option
            v-for="item in phpVersions"
            :key="item.version"
            :label="item.description || item.image"
            :value="item.version"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="镜像" prop="image">
        <el-input v-model="form.image" disabled placeholder="请选择版本后自动填充" />
      </el-form-item>

      <el-form-item label="容器名称" prop="containerName">
        <el-input v-model="form.containerName" placeholder="例如: php84" />
      </el-form-item>

      <el-form-item label="端口" prop="port">
        <el-input-number
          v-model="form.port"
          :min="1"
          :max="65535"
          controls-position="right"
          style="width: 100%"
          placeholder="例如: 9084"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose" :disabled="loading">取消</el-button>
        <el-button type="primary" :loading="loading" @click="handleSubmit">
          开始安装
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, reactive } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'installed'])

const visible = ref(false)
const formRef = ref(null)
const loading = ref(false)
const versionsLoading = ref(false)
const phpVersions = ref([])

const form = reactive({
  selectedVersion: '',
  image: '',
  containerName: '',
  port: undefined
})

const rules = {
  selectedVersion: [{ required: true, message: '请选择PHP版本', trigger: 'change' }],
  image: [{ required: true, message: '镜像信息缺失', trigger: 'change' }],
  containerName: [
    { required: true, message: '请填写容器名称', trigger: 'blur' },
    { pattern: /^php\d{2}$/, message: '容器名必须是php+2位数字，例如php84', trigger: 'blur' }
  ],
  port: [{ required: true, message: '请填写端口', trigger: 'blur' }]
}

// 监听 visible 变化
watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    resetForm()
    loadPhpVersions()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const resetForm = () => {
  form.selectedVersion = ''
  form.image = ''
  form.containerName = ''
  form.port = undefined
  if (formRef.value) formRef.value.resetFields()
}

const getDefaultContainerName = (version) => {
  const v = String(version || '')
  const match = v.match(/(\d)\.(\d)/)
  if (!match) return ''
  return `php${match[1]}${match[2]}`
}

const handleVersionChange = (version) => {
  const item = phpVersions.value.find((v) => v.version === version)
  if (item) {
    form.image = item.image || ''
    form.port = item.defaultPort ? Number(item.defaultPort) : undefined
    form.containerName = getDefaultContainerName(item.version)
  }
}

const loadPhpVersions = async () => {
  try {
    versionsLoading.value = true
    const resp = await fetch('/api/appstore/php-versions')
    const result = await resp.json()

    if (result && result.success) {
      const data = result.data || {}
      const envList = Array.isArray(data.environments) ? data.environments : Array.isArray(data) ? data : []
      phpVersions.value = envList

      if (phpVersions.value.length > 0) {
        // 默认选中第一个
        const first = phpVersions.value[0]
        form.selectedVersion = first.version
        handleVersionChange(first.version)
      }
    } else {
      ElMessage.error(result?.message || '加载PHP版本失败')
    }
  } catch {
    ElMessage.error('加载PHP版本失败')
  } finally {
    versionsLoading.value = false
  }
}

const handleClose = () => {
  if (loading.value) return
  visible.value = false
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    if (!props.nodeId) {
      ElMessage.warning('请选择节点')
      return
    }

    try {
      loading.value = true
      const resp = await fetch(`/api/forward/${props.nodeId}/php/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: form.image.trim(),
          containerName: form.containerName.trim(),
          port: form.port,
        }),
      })

      const result = await resp.json()
      if (result && result.success) {
        ElMessage.success(result.message || 'PHP安装任务已创建')
        emit('installed', result.data)
        handleClose()
      } else {
        ElMessage.error(result?.message || '创建安装任务失败')
      }
    } catch {
      ElMessage.error('创建安装任务失败')
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;

}
</style>
