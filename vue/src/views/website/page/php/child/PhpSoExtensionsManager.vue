<template>
  <div class="so-manager-container" v-loading="loading">
    <div class="operation-bar">
      <el-input
        v-model="filename"
        placeholder="例如 redis.so，请将.so文件存放在/php/php版本/ext目录下"
        class="filename-input"
        clearable
        @keyup.enter="handleAdd"
      >
        <template #append>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!filename || loading"
            @click="handleAdd"
          >
            添加并重启
          </el-button>
        </template>
      </el-input>
      <el-button
        :icon="Refresh"
        @click="loadList"
        :loading="loading"
      >
        刷新列表
      </el-button>
    </div>

    <el-table :data="extensions" style="width: 100%" class="so-table" border stripe>
      <el-table-column label="扩展文件名">
        <template #default="{ row }">
          <span class="ext-name">{{ row }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center">
        <template #default="{ row }">
          <el-button
            type="danger"
            link
            :loading="saving"
            @click="handleRemove(row)"
          >
            移除
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂未配置自定义 .so 扩展" :image-size="60" />
      </template>
    </el-table>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />
  </div>
</template>

<style scoped>
.so-manager-container {
  padding: 10px 0;
}

.operation-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.filename-input {
  flex: 1;
}

.so-table {
  margin-bottom: 16px;
}

.ext-name {
  font-family: monospace;
  font-weight: 500;
}

.error-alert {
  margin-top: 16px;
}

@media (max-width: 600px) {
  .operation-bar {
    flex-direction: column;
  }
  
  .filename-input {
    width: 100%;
  }
}
</style>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

const props = defineProps({
  nodeId: { type: String, default: '' },
  containerName: { type: String, default: '' },
})

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const extensions = ref([])
const filename = ref('')

const loadList = async () => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  if (!nodeId || !containerName) {
    return
  }
  loading.value = true
  error.value = ''
  try {
    const qs = new URLSearchParams()
    qs.set('containerName', containerName)
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/extensions/so?${qs.toString()}`
    const resp = await fetch(url)
    let result = null
    try {
      result = await resp.json()
    } catch {
      result = null
    }
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '获取自定义扩展配置失败'
      throw new Error(msg)
    }
    const resData = result.data || {}
    // 兼容不同的返回格式
    const data = (resData.data && typeof resData.data === 'object') ? resData.data : resData
    extensions.value = Array.isArray(data.extensions) ? data.extensions : []
  } catch (e) {
    error.value = String(e && e.message ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

const handleAdd = async () => {
  const nodeId = String(props.nodeId || '').trim()
  const containerName = String(props.containerName || '').trim()
  const name = String(filename.value || '').trim()
  if (!nodeId) {
    error.value = '请选择节点'
    return
  }
  if (!containerName) {
    error.value = '容器信息缺失'
    return
  }
  if (!name) {
    error.value = '扩展文件名不能为空'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await ElMessageBox.confirm(`确定要添加扩展文件 "${name}" 吗？`, '添加确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/extensions/so`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerName,
        filename: name,
        action: 'add',
      }),
    })
    const result = await resp.json().catch(() => null)
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '添加自定义扩展失败'
      throw new Error(msg)
    }
    ElMessage.success(result.message || '已添加自定义扩展并重启PHP')
    filename.value = ''
    await loadList()
  } catch (e) {
    if (e !== 'cancel') {
      const msg = String(e && e.message ? e.message : '操作失败')
      error.value = msg
      ElMessage.error(msg)
    }
  } finally {
    saving.value = false
  }
}

const handleRemove = async (name) => {
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
    await ElMessageBox.confirm(`确定要移除扩展文件 "${name}" 吗？`, '移除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const url = `/api/forward/${encodeURIComponent(nodeId)}/php/extensions/so`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerName,
        filename: name,
        action: 'remove',
      }),
    })
    const result = await resp.json().catch(() => null)
    if (!resp.ok || !result || !result.success) {
      const msg = (result && result.message) || '移除自定义扩展失败'
      throw new Error(msg)
    }
    ElMessage.success(result.message || '已移除自定义扩展并重启PHP')
    await loadList()
  } catch (e) {
    if (e !== 'cancel') {
      const msg = String(e && e.message ? e.message : '操作失败')
      error.value = msg
      ElMessage.error(msg)
    }
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.nodeId, props.containerName],
  () => {
    error.value = ''
    extensions.value = []
    filename.value = ''
    if (props.nodeId && props.containerName) {
      loadList()
    }
  },
  { immediate: true },
)
</script>

