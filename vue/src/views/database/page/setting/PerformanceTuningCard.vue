<template>
  <div class="performance-tuning-card">
    <div class="card-header">
      <h3 class="card-title">性能调整</h3>
      <div class="header-actions">
        <el-select
          v-model="selectedPreset"
          placeholder="预设方案"
          class="preset-select"
          @change="applyPreset"
          clearable
        >
          <el-option
            v-for="preset in presets"
            :key="preset.name"
            :label="preset.name"
            :value="preset.name"
          />
        </el-select>
        <el-button type="primary" @click="saveSettings" :loading="saving">
          保存并持久化
        </el-button>
        <el-button @click="resetToDefault">
          重置为默认
        </el-button>
      </div>
    </div>

    <div class="card-content">
      <div class="parameters-section">
        <div class="parameter-grid">
          <div
            v-for="param in parameters"
            :key="param.key"
            class="parameter-item"
          >
            <div class="parameter-label">
              {{ param.label }}
              <span class="parameter-unit">({{ param.unit || '值' }})</span>
            </div>
            <div class="parameter-input-group">
              <el-input-number
                v-model="parameterValues[param.key]"
                :min="param.min"
                :max="param.max"
                :step="1"
                @change="onParameterChange"
                controls-position="right"
                class="parameter-input"
              />
            </div>
            <div class="parameter-description">
              {{ param.description }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  nodeId: {
    type: [String, Number],
    default: ''
  },
  serviceStatus: {
    type: String,
    default: ''
  }
})

const presets = ref([
  {
    name: '≤ 2GB（小内存）',
    values: {
      innodb_buffer_pool_size: 512,
      thread_cache_size: 8,
      max_connections: 150,
      wait_timeout: 1800,
      interactive_timeout: 1800,
      tmp_table_size: 64,
      max_heap_table_size: 64,
      table_open_cache: 2000,
      max_allowed_packet: 16,
      innodb_flush_log_at_trx_commit: 1,
      sync_binlog: 1,
      innodb_io_capacity: 1000,
      innodb_io_capacity_max: 2000
    }
  },
  {
    name: '2–4GB',
    values: {
      innodb_buffer_pool_size: 1024,
      thread_cache_size: 16,
      max_connections: 300,
      wait_timeout: 1200,
      interactive_timeout: 1200,
      tmp_table_size: 128,
      max_heap_table_size: 128,
      table_open_cache: 4000,
      max_allowed_packet: 32,
      innodb_flush_log_at_trx_commit: 1,
      sync_binlog: 1,
      innodb_io_capacity: 2000,
      innodb_io_capacity_max: 4000
    }
  },
  {
    name: '4–8GB',
    values: {
      innodb_buffer_pool_size: 3072,
      thread_cache_size: 32,
      max_connections: 500,
      wait_timeout: 1800,
      interactive_timeout: 1800,
      tmp_table_size: 256,
      max_heap_table_size: 256,
      table_open_cache: 8000,
      max_allowed_packet: 64,
      innodb_flush_log_at_trx_commit: 2,
      sync_binlog: 100,
      innodb_io_capacity: 3000,
      innodb_io_capacity_max: 6000
    }
  },
  {
    name: '8–16GB',
    values: {
      innodb_buffer_pool_size: 6144,
      thread_cache_size: 64,
      max_connections: 800,
      wait_timeout: 1800,
      interactive_timeout: 1800,
      tmp_table_size: 512,
      max_heap_table_size: 512,
      table_open_cache: 12000,
      max_allowed_packet: 64,
      innodb_flush_log_at_trx_commit: 2,
      sync_binlog: 100,
      innodb_io_capacity: 4000,
      innodb_io_capacity_max: 8000
    }
  },
  {
    name: '≥ 16GB',
    values: {
      innodb_buffer_pool_size: 8192,
      thread_cache_size: 96,
      max_connections: 1000,
      wait_timeout: 3600,
      interactive_timeout: 3600,
      tmp_table_size: 1024,
      max_heap_table_size: 1024,
      table_open_cache: 16000,
      max_allowed_packet: 64,
      innodb_flush_log_at_trx_commit: 2,
      sync_binlog: 100,
      innodb_io_capacity: 6000,
      innodb_io_capacity_max: 12000
    }
  }
])

const parameters = ref([
  {
    key: 'innodb_buffer_pool_size',
    label: 'innodb_buffer_pool_size',
    unit: 'MB',
    description: 'InnoDB缓冲池大小',
    min: 8,
    max: 8192
  },
  {
    key: 'thread_cache_size',
    label: 'thread_cache_size',
    unit: '',
    description: '线程缓存大小',
    min: 0,
    max: 100
  },
  {
    key: 'max_connections',
    label: 'max_connections',
    unit: '',
    description: '最大连接数',
    min: 1,
    max: 1000
  },
  {
    key: 'wait_timeout',
    label: 'wait_timeout',
    unit: '秒',
    description: '空闲连接超时',
    min: 1,
    max: 86400
  },
  {
    key: 'interactive_timeout',
    label: 'interactive_timeout',
    unit: '秒',
    description: '交互连接超时',
    min: 1,
    max: 86400
  },
  {
    key: 'tmp_table_size',
    label: 'tmp_table_size',
    unit: 'MB',
    description: '内存临时表阈值',
    min: 16,
    max: 8192
  },
  {
    key: 'max_heap_table_size',
    label: 'max_heap_table_size',
    unit: 'MB',
    description: '内存临时表最大值',
    min: 16,
    max: 8192
  },
  {
    key: 'table_open_cache',
    label: 'table_open_cache',
    unit: '',
    description: '表缓存大小',
    min: 100,
    max: 20000
  },
  {
    key: 'max_allowed_packet',
    label: 'max_allowed_packet',
    unit: 'MB',
    description: '最大包大小',
    min: 1,
    max: 1024
  },
  {
    key: 'innodb_flush_log_at_trx_commit',
    label: 'innodb_flush_log_at_trx_commit',
    unit: '',
    description: '事务日志刷盘策略',
    min: 0,
    max: 2
  },
  {
    key: 'sync_binlog',
    label: 'sync_binlog',
    unit: '',
    description: '二进制日志刷盘频率',
    min: 0,
    max: 10000
  },
  {
    key: 'innodb_io_capacity',
    label: 'innodb_io_capacity',
    unit: '',
    description: 'IO能力',
    min: 100,
    max: 20000
  },
  {
    key: 'innodb_io_capacity_max',
    label: 'innodb_io_capacity_max',
    unit: '',
    description: 'IO能力上限',
    min: 100,
    max: 40000
  }
])

const selectedPreset = ref('')

const defaultValues = {
  innodb_buffer_pool_size: 128,
  thread_cache_size: 8,
  max_connections: 151,
  wait_timeout: 28800,
  interactive_timeout: 28800,
  tmp_table_size: 128,
  max_heap_table_size: 128,
  table_open_cache: 4000,
  max_allowed_packet: 32,
  innodb_flush_log_at_trx_commit: 1,
  sync_binlog: 1,
  innodb_io_capacity: 2000,
  innodb_io_capacity_max: 4000
}

const parameterValues = reactive({ ...defaultValues })

const saving = ref(false)

const applyPreset = () => {
  if (!selectedPreset.value) return
  const preset = presets.value.find((p) => p.name === selectedPreset.value)
  if (preset) {
    Object.assign(parameterValues, preset.values)
  }
}

const onParameterChange = () => {
  selectedPreset.value = ''
}

const resetToDefault = () => {
  Object.assign(parameterValues, defaultValues)
  selectedPreset.value = ''
  ElMessage.info('已重置为默认配置（尚未保存）')
}

const saveSettings = async () => {
  if (!props.nodeId) return
  try {
    await ElMessageBox.confirm(
      '确定要保存并持久化性能设置吗？',
      '操作确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }
  const body = {
    innodb_buffer_pool_size: Number(parameterValues.innodb_buffer_pool_size) * 1024 * 1024,
    thread_cache_size: Number(parameterValues.thread_cache_size),
    max_connections: Number(parameterValues.max_connections),
    wait_timeout: Number(parameterValues.wait_timeout),
    interactive_timeout: Number(parameterValues.interactive_timeout),
    tmp_table_size: Number(parameterValues.tmp_table_size) * 1024 * 1024,
    max_heap_table_size: Number(parameterValues.max_heap_table_size) * 1024 * 1024,
    table_open_cache: Number(parameterValues.table_open_cache),
    max_allowed_packet: Number(parameterValues.max_allowed_packet) * 1024 * 1024,
    innodb_flush_log_at_trx_commit: Number(parameterValues.innodb_flush_log_at_trx_commit),
    sync_binlog: Number(parameterValues.sync_binlog),
    innodb_io_capacity: Number(parameterValues.innodb_io_capacity),
    innodb_io_capacity_max: Number(parameterValues.innodb_io_capacity_max)
  }
  try {
    saving.value = true
    const res = await fetch(
      `/api/forward/${props.nodeId}/mysql/admin/performance?persist=true`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok || (json && json.success === false)) {
      throw new Error((json && json.message) || '保存失败')
    }
    ElMessage.success('性能设置已保存并持久化')
  } catch (err) {
    ElMessage.error(`保存失败: ${(err && err.message) || '请求错误'}`)
  } finally {
    saving.value = false
  }
}

const loadCurrent = async () => {
  if (!props.nodeId) return
  try {
    const res = await fetch(`/api/forward/${props.nodeId}/mysql/admin/performance`)
    if (!res.ok) return
    const json = await res.json().catch(() => null)
    const data = json && json.data ? json.data : null
    if (!data) return
    const toMB = (n) => {
      const x = Number(n)
      if (Number.isNaN(x)) return n
      return Math.max(1, Math.round(x / 1024 / 1024))
    }
    const patch = {
      innodb_buffer_pool_size: toMB(data.innodb_buffer_pool_size),
      thread_cache_size: Number(data.thread_cache_size),
      max_connections: Number(data.max_connections),
      wait_timeout: Number(data.wait_timeout),
      interactive_timeout: Number(data.interactive_timeout),
      tmp_table_size: toMB(data.tmp_table_size),
      max_heap_table_size: toMB(data.max_heap_table_size),
      table_open_cache: Number(data.table_open_cache),
      max_allowed_packet: toMB(data.max_allowed_packet),
      innodb_flush_log_at_trx_commit: Number(data.innodb_flush_log_at_trx_commit),
      sync_binlog: Number(data.sync_binlog),
      innodb_io_capacity: Number(data.innodb_io_capacity),
      innodb_io_capacity_max: Number(data.innodb_io_capacity_max)
    }
    Object.assign(parameterValues, patch)
  } catch {
    void 0
  }
}

watch(
  () => props.nodeId,
  async (v) => {
    if (v) await loadCurrent()
  }
)
</script>

<style scoped>
.performance-tuning-card {
  background: transparent;
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-title {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.preset-select {
  width: 220px;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.parameters-section {
  margin-bottom: 8px;
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.parameter-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.parameter-label {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 500;
}

.parameter-unit {
  margin-left: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.parameter-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.parameter-input {
  width: 100%;
}

.parameter-description {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .header-actions {
    gap: 8px;
    width: 100%;
  }
}
</style>
