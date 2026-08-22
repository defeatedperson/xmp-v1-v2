<template>
  <div class="settings-container" v-loading="loading">
    <el-scrollbar height="100%">
      <div class="settings-content">
        <el-alert
          v-if="error"
          :title="error"
          type="error"
          show-icon
          :closable="false"
          class="mb-4"
        />

        <el-form label-position="top">
          <el-form-item label="disable_functions (禁用函数)">
            <template #label>
              <span class="form-label">disable_functions</span>
              <span class="label-tip">每行一个函数名，或用逗号分隔</span>
            </template>
            <el-input
              v-model="functionsText"
              type="textarea"
              :rows="8"
              placeholder="例如: exec,passthru,shell_exec,system..."
              resize="vertical"
            />
          </el-form-item>

          <el-form-item label="disable_classes (禁用类)">
            <template #label>
              <span class="form-label">disable_classes</span>
              <span class="label-tip">每行一个类名，或用逗号分隔</span>
            </template>
            <el-input
              v-model="classesText"
              type="textarea"
              :rows="4"
              placeholder="例如: COM,dotnet..."
              resize="vertical"
            />
          </el-form-item>

          <div class="form-actions">
            <el-button
              type="primary"
              :loading="saving"
              :disabled="loading"
              @click="saveSettings"
            >
              保存并应用
            </el-button>
            <el-button :disabled="loading || saving" @click="loadSettings">
              重新加载
            </el-button>
          </div>
        </el-form>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  nodeId: { type: String, default: '' },
  containerName: { type: String, default: '' },
})

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const isDefault = ref(true)
const functionsText = ref('')
const classesText = ref('')

const splitValue = (value) => {
  const s = String(value || '')
  if (!s) return []
  return s
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

const joinValue = (list) => {
  if (!Array.isArray(list) || !list.length) return ''
  return list.join(',')
}

const toTextarea = (value) => {
  const list = splitValue(value)
  return list.join('\n')
}

const loadSettings = async () => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId || !containerName) {
    return
  }
  loading.value = true
  error.value = ''
  try {
    const keys = ['disable_functions', 'disable_classes']
    const qs = new URLSearchParams()
    qs.set('containerName', containerName)
    qs.set('keys', keys.join(','))
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/settings?${qs.toString()}`
    const resp = await fetch(url)
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '获取PHP配置失败'
      throw new Error(msg)
    }
    const resData = result.data || {}
    // 兼容不同的返回格式
    const data = (resData.data && typeof resData.data === 'object') ? resData.data : resData
    isDefault.value = !!resData.isDefault
    functionsText.value = toTextarea(data.disable_functions)
    classesText.value = toTextarea(data.disable_classes)
  } catch (e) {
    error.value = String(e && e.message ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId) {
    error.value = '请选择节点'
    return
  }
  if (!containerName) {
    error.value = '容器信息缺失'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const functionsList = splitValue(functionsText.value)
    const classesList = splitValue(classesText.value)
    const settings = {
      disable_functions: joinValue(functionsList),
      disable_classes: joinValue(classesList),
    }
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/settings`
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerName,
        settings,
      }),
    })
    const result = await resp.json().catch(() => null)
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '更新PHP配置失败'
      throw new Error(msg)
    }
    isDefault.value = false
    ElMessage.success(result.message || 'PHP禁用函数配置已更新')
    await loadSettings()
  } catch (e) {
    const msg = String(e && e.message ? e.message : '保存失败')
    error.value = msg
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.nodeId, props.containerName],
  () => {
    error.value = ''
    isDefault.value = true
    if (props.nodeId && props.containerName) {
      loadSettings()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.settings-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-content {
  padding: 20px;
}

.form-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-right: 8px;
}

.label-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: normal;
}

.form-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.mb-4 {
  margin-bottom: 16px;
}

:deep(.el-textarea__inner) {
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  background-color: var(--el-fill-color-blank);
}

:deep(.el-form-item__label) {
  padding-bottom: 8px;
}
</style>


