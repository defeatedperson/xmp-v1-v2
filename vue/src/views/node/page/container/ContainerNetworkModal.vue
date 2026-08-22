<template>
  <el-dialog
    v-model="visible"
    title="容器网络信息"
    width="800px"
    :before-close="handleClose"
    class="network-modal"
  >
    <div class="network-body" v-loading="loading">
      <div v-if="error" class="error-text">
        <el-alert :title="error" type="error" show-icon :closable="false" />
      </div>

      <div v-else class="content-wrapper">
        <div class="header-actions">
           <el-button :icon="Refresh" @click="fetchNetworks" :loading="loading" circle />
        </div>

        <el-table :data="networks" border stripe style="width: 100%">
          <el-table-column prop="name" label="网络名称" width="150" show-overflow-tooltip />
          <el-table-column label="IPv4" min-width="180">
            <template #default="{ row }">
              <div class="ip-cell">
                <span>{{ extractIpAddress(row.ipCidr || row.ip) }}</span>
                <el-button
                  v-if="row.ipCidr || row.ip"
                  link
                  type="primary"
                  :icon="CopyDocument"
                  @click="copyText(extractIpAddress(row.ipCidr || row.ip))"
                />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="IPv6" min-width="180">
            <template #default="{ row }">
              <div class="ip-cell">
                <span>{{ extractIpAddress(row.ipv6Cidr || row.ipv6) }}</span>
                <el-button
                  v-if="row.ipv6Cidr || row.ipv6"
                  link
                  type="primary"
                  :icon="CopyDocument"
                  @click="copyText(extractIpAddress(row.ipv6Cidr || row.ipv6))"
                />
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="gateway" label="网关" width="120" show-overflow-tooltip />
          <el-table-column label="别名" min-width="150" show-overflow-tooltip>
             <template #default="{ row }">
               {{ (row.aliases || []).join(', ') || '-' }}
             </template>
          </el-table-column>
        </el-table>

        <el-alert
          v-if="isHostNetwork"
          title="网络提示"
          type="info"
          show-icon
          :closable="false"
          class="network-hint"
        >
          <template #default>
            <div>
              <p>当前容器使用 host 网络：与宿主机共享网络命名空间，端口由应用自行监听并随宿主机对外暴露。</p>
              <p>如需互联或访问，请使用宿主机 IP（或域名）进行连接。</p>
            </div>
          </template>
        </el-alert>

        <el-alert
          v-else
          title="网络提示"
          type="success"
          show-icon
          :closable="false"
          class="network-hint"
        >
          <template #default>
            <div>
              <p>如果需要容器内网互联，建议使用 "xmp-network" 网络中的地址。</p>
              <p>也可通过“容器名”进行解析访问，提升可维护性。</p>
            </div>
          </template>
        </el-alert>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { Refresh, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  nodeId: { type: String, required: true },
  containerId: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const loading = ref(false)
const error = ref('')
const networks = ref([])

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.nodeId && props.containerId) {
    fetchNetworks()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const extractIpAddress = (cidr) => {
  if (!cidr) return '-'
  return cidr.split('/')[0]
}

const fetchNetworks = async () => {
  loading.value = true
  error.value = ''
  networks.value = []
  try {
    const url = `/api/forward/${props.nodeId}/docker/containers/${props.containerId}/networks`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (!data.success) throw new Error(data.message || '获取容器网络信息失败')
    const result = data.data || {}
    networks.value = result.networks || []
  } catch (err) {
    error.value = err.message || '获取容器网络信息时发生错误'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

const isHostNetwork = computed(() => {
  return Array.isArray(networks.value) && networks.value.some(n => String(n.name).toLowerCase() === 'host')
})

const copyText = async (text) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

const handleClose = () => {
  if (loading.value) return
  visible.value = false
}
</script>

<style scoped>
.network-body {
  min-height: 200px;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.header-actions {
  display: flex;
  justify-content: flex-end;
}

.ip-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.network-hint {
  margin-top: 10px;
}
</style>
