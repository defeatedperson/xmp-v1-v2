<template>
  <div class="php-settings-container" v-loading="loading">
    <el-form :model="form" label-position="top" class="settings-form">
      <el-row :gutter="20">
        <el-col :xs="24" :sm="8">
          <el-form-item label="短标签支持">
            <el-switch v-model="form.short_open_tag" active-text="开启" inactive-text="关闭" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-form-item label="输出详细错误信息">
            <el-switch v-model="form.display_errors" active-text="开启" inactive-text="关闭" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-form-item label="允许上传文件">
            <el-switch v-model="form.file_uploads" active-text="开启" inactive-text="关闭" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :xs="24" :sm="8">
          <el-form-item label="max_execution_time">
            <template #label>
              <div class="label-with-hint">
                <span>max_execution_time</span>
                <span class="settings-hint">最大脚本运行时间</span>
              </div>
            </template>
            <el-input v-model="form.max_execution_time" type="number" min="0" placeholder="秒">
              <template #append>秒</template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-form-item label="max_input_time">
            <template #label>
              <div class="label-with-hint">
                <span>max_input_time</span>
                <span class="settings-hint">最大输入时间</span>
              </div>
            </template>
            <el-input v-model="form.max_input_time" type="number" min="0" placeholder="秒">
              <template #append>秒</template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-form-item label="default_socket_timeout">
            <template #label>
              <div class="label-with-hint">
                <span>default_socket_timeout</span>
                <span class="settings-hint">Socket 超时时间</span>
              </div>
            </template>
            <el-input v-model="form.default_socket_timeout" type="number" min="0" placeholder="秒">
              <template #append>秒</template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :xs="24" :sm="8">
          <el-form-item label="post_max_size">
            <template #label>
              <div class="label-with-hint">
                <span>post_max_size</span>
                <span class="settings-hint">POST 数据最大尺寸</span>
              </div>
            </template>
            <el-input v-model="form.post_max_size" placeholder="例如 16M" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-form-item label="upload_max_filesize">
            <template #label>
              <div class="label-with-hint">
                <span>upload_max_filesize</span>
                <span class="settings-hint">允许上传文件的最大尺寸</span>
              </div>
            </template>
            <el-input v-model="form.upload_max_filesize" placeholder="例如 8M" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-form-item label="max_file_uploads">
            <template #label>
              <div class="label-with-hint">
                <span>max_file_uploads</span>
                <span class="settings-hint">允许同时上传文件的最大数量</span>
              </div>
            </template>
            <el-input v-model="form.max_file_uploads" type="number" min="0" placeholder="数量" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :xs="24" :sm="8">
          <el-form-item label="memory_limit">
            <template #label>
              <div class="label-with-hint">
                <span>memory_limit</span>
                <span class="settings-hint">脚本内存限制</span>
              </div>
            </template>
            <el-input v-model="form.memory_limit" placeholder="例如 256M" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="16">
          <el-form-item label="error_reporting">
            <template #label>
              <div class="label-with-hint">
                <span>error_reporting</span>
                <span class="settings-hint">错误级别</span>
              </div>
            </template>
            <el-input v-model="form.error_reporting" placeholder="例如 E_ALL&~E_DEPRECATED" />
          </el-form-item>
        </el-col>
      </el-row>

      <div class="settings-actions">
        <el-button type="primary" :loading="saving" :disabled="loading" @click="saveSettings">
          保存并应用
        </el-button>
        <el-button :disabled="loading || saving" @click="loadSettings">
          重新加载
        </el-button>
        <el-button :disabled="saving || loading" @click="restoreDefaults">
          恢复默认
        </el-button>
      </div>

      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="mt-4" />
    </el-form>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  nodeId: { type: String, default: '' },
  containerName: { type: String, default: '' },
})

const form = ref({
  short_open_tag: false,
  default_socket_timeout: '',
  max_execution_time: '',
  max_input_time: '',
  post_max_size: '',
  file_uploads: true,
  upload_max_filesize: '',
  max_file_uploads: '',
  memory_limit: '',
  display_errors: false,
  error_reporting: '',
})

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const isDefault = ref(true)

const defaultSettings = Object.freeze({
  short_open_tag: false,
  default_socket_timeout: '60',
  max_execution_time: '60',
  max_input_time: '60',
  post_max_size: '64M',
  file_uploads: true,
  upload_max_filesize: '50M',
  max_file_uploads: '20',
  memory_limit: '256M',
  display_errors: false,
  error_reporting: 'E_ALL & ~E_DEPRECATED & ~E_STRICT',
})

const boolFromValue = (value) => {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return false
  if (s === '1' || s === 'on' || s === 'true' || s === 'yes') return true
  if (s === '0' || s === 'off' || s === 'false' || s === 'no') return false
  return false
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
    const keys = [
      'short_open_tag',
      'default_socket_timeout',
      'max_execution_time',
      'max_input_time',
      'post_max_size',
      'file_uploads',
      'upload_max_filesize',
      'max_file_uploads',
      'memory_limit',
      'display_errors',
      'error_reporting',
    ]
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
    // 兼容不同的返回格式：有些在 resData.data，有些直接在 resData
    const data = (resData.data && typeof resData.data === 'object') ? resData.data : resData
    isDefault.value = !!resData.isDefault
    form.value.short_open_tag = boolFromValue(data.short_open_tag)
    form.value.display_errors = boolFromValue(data.display_errors)
    form.value.file_uploads = boolFromValue(data.file_uploads)
    form.value.max_execution_time = data.max_execution_time != null ? String(data.max_execution_time) : ''
    form.value.max_input_time = data.max_input_time != null ? String(data.max_input_time) : ''
    form.value.default_socket_timeout =
      data.default_socket_timeout != null ? String(data.default_socket_timeout) : ''
    form.value.post_max_size = data.post_max_size != null ? String(data.post_max_size) : ''
    form.value.upload_max_filesize =
      data.upload_max_filesize != null ? String(data.upload_max_filesize) : ''
    form.value.max_file_uploads =
      data.max_file_uploads != null ? String(data.max_file_uploads) : ''
    form.value.memory_limit = data.memory_limit != null ? String(data.memory_limit) : ''
    form.value.error_reporting = data.error_reporting != null ? String(data.error_reporting) : ''
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
    await ElMessageBox.confirm('确定要保存并应用这些设置吗？这将会重启 PHP 容器。', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    const settings = {
      short_open_tag: form.value.short_open_tag,
      default_socket_timeout: form.value.default_socket_timeout,
      max_execution_time: form.value.max_execution_time,
      max_input_time: form.value.max_input_time,
      post_max_size: form.value.post_max_size,
      file_uploads: form.value.file_uploads,
      upload_max_filesize: form.value.upload_max_filesize,
      max_file_uploads: form.value.max_file_uploads,
      memory_limit: form.value.memory_limit,
      display_errors: form.value.display_errors,
      error_reporting: form.value.error_reporting,
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
    ElMessage.success(result.message || 'PHP配置已更新并重载')
    await loadSettings()
  } catch (e) {
    if (e === 'cancel') {
      return
    }
    const msg = String(e && e.message ? e.message : '保存失败')
    error.value = msg
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

const restoreDefaults = () => {
  form.value = {
    ...form.value,
    ...defaultSettings,
  }
  error.value = ''
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
.php-settings-container {
  padding: 20px;
}

@media (max-width: 1200px) {
  .php-settings-container {
    padding: 12px;
  }

  .settings-actions {
    flex-direction: column;
    width: 100%;
    gap: 8px;
  }

  .settings-actions .el-button {
    margin-left: 0 !important;
    width: 100%;
  }
}


.label-with-hint {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-hint {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}

.settings-actions {
  margin-top: 30px;
  display: flex;
  gap: 12px;
}

.mt-4 {
  margin-top: 16px;
}

/* 深度选择器用于调整 Element Plus 组件在暗色背景下的样式 */
:deep(.el-form-item__label) {
  color: #e5eaf3;
  padding-bottom: 4px;
}

:deep(.el-input__wrapper) {
  background-color: #1d1e1f;
  box-shadow: 0 0 0 1px #4c4d4f inset;
}

:deep(.el-input__inner) {
  color: #cfd3dc;
}

:deep(.el-input-group__append) {
  background-color: #262727;
  color: #909399;
  border-color: #4c4d4f;
}

:deep(.el-switch__label) {
  color: #909399;
}

:deep(.el-switch__label.is-active) {
  color: #409eff;
}
</style>
