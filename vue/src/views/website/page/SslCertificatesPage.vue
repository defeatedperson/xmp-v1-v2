<template>
  <div class="ssl-certificates-page">
    <!-- 顶部筛选与操作区 -->
    <div class="filter-header">
      <div class="header-left">
        <NodeSelector
          :node-type="1"
          @node-selected="handleNodeSelected"
          class="node-select-wrapper"
        />
      </div>

      <div class="header-right">
        <el-input
          v-model="searchQuery"
          placeholder="搜索证书名或域名..."
          class="search-input"
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-button-group class="action-buttons">
          <el-button :icon="Refresh" @click="handleRefresh" :loading="loading" title="刷新列表">刷新</el-button>
          <el-button type="primary" :icon="Medal" @click="applyCertificate">申请证书</el-button>
          <el-button type="success" :icon="Upload" @click="uploadCertificate">上传证书</el-button>
          <el-button type="warning" :icon="EditPen" @click="selfSignCertificate">自签证书</el-button>
          <el-button type="danger" :icon="MagicStick" @click="repairScan" title="修复扫描">修复</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 证书表格 -->
    <div class="table-container" v-loading="loading">
      <el-table :data="filteredCertificates" style="width: 100%" border stripe>
        <el-table-column prop="name" label="证书名" min-width="150" show-overflow-tooltip />
        <el-table-column prop="domain" label="域名" min-width="200" show-overflow-tooltip />
        <el-table-column prop="email" label="邮箱" min-width="150" />
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getSourceTagType(row.source)" size="small">
              {{ getSourceLabel(row.source) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tooltip
              v-if="row.lastError"
              :content="row.lastError"
              placement="top"
              effect="dark"
            >
              <el-tag :type="getStatusTagType(row.status)" size="small" class="status-tag">
                {{ getStatusLabel(row.status) }}
              </el-tag>
            </el-tooltip>
            <el-tag v-else :type="getStatusTagType(row.status)" size="small">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="editCertificate(row)">设置</el-button>
            <el-button link type="primary" @click="viewCertificate(row)">查看</el-button>
            <el-button link type="danger" @click="deleteCertificate(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 弹窗组件 -->
    <SslCertViewModal
      v-model:visible="showViewModal"
      :node-id="currentNodeId"
      :cert-name="currentCert.name"
      :cert-domain="currentCert.domain"
    />

    <SslCertApplyModal
      v-model:visible="showApplyModal"
      :node-id="currentNodeId"
      @success="loadCertificates"
    />

    <SslCertSelfSignModal
      v-model:visible="showSelfSignModal"
      :node-id="currentNodeId"
      @success="loadCertificates"
    />

    <SslCertUploadModal
      v-model:visible="showUploadModal"
      :node-id="currentNodeId"
      @success="loadCertificates"
    />

    <SslCertSettingsModal
      v-model:visible="showSettingsModal"
      :node-id="currentNodeId"
      :cert-name="currentCert.name"
      @success="loadCertificates"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, Upload, MagicStick,
  EditPen, Medal
} from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'
import SslCertViewModal from './ssl/SslCertViewModal.vue'
import SslCertApplyModal from './ssl/SslCertApplyModal.vue'
import SslCertSelfSignModal from './ssl/SslCertSelfSignModal.vue'
import SslCertUploadModal from './ssl/SslCertUploadModal.vue'
import SslCertSettingsModal from './ssl/SslCertSettingsModal.vue'

const searchQuery = ref('')
const currentNodeId = ref('')
const certificates = ref([])
const loading = ref(false)

// 弹窗状态
const showViewModal = ref(false)
const showApplyModal = ref(false)
const showSelfSignModal = ref(false)
const showUploadModal = ref(false)
const showSettingsModal = ref(false)
const currentCert = ref({ name: '', domain: '' })

// API 定义
const sslAPI = {
  async listCerts(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/website/ssl/certs`)
    return await response.json()
  },
  async deleteCert(nodeId, certName) {
    const response = await fetch(`/api/forward/${nodeId}/website/ssl/certs/${encodeURIComponent(certName)}`, {
      method: 'DELETE'
    })
    return await response.json()
  },
  async repairIndex(nodeId) {
    const response = await fetch(`/api/forward/${nodeId}/website/ssl/repair-index`, {
      method: 'POST'
    })
    return await response.json()
  }
}

// 格式化函数
const getStatusLabel = (status) => {
  const labels = {
    issue_success: '正常',
    issue_failed: '签发失败',
    renew_success: '续签正常',
    renew_failed: '续签失败'
  }
  return labels[status] || '未知'
}

const getStatusTagType = (status) => {
  const types = {
    issue_success: 'success',
    issue_failed: 'danger',
    renew_success: 'success',
    renew_failed: 'warning'
  }
  return types[status] || 'info'
}

const getSourceLabel = (source) => {
  const labels = {
    letsencrypt: "Let's Encrypt",
    zerossl: 'ZeroSSL',
    self_signed: '自签证书',
    upload: '上传证书',
    other: '其他来源',
  }
  return labels[source] || source || '未知'
}

const getSourceTagType = (source) => {
  const types = {
    letsencrypt: '',
    zerossl: 'warning',
    self_signed: 'info',
    upload: 'success',
    other: 'info'
  }
  return types[source] || 'info'
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

// 过滤后的证书列表
const filteredCertificates = computed(() => {
  if (!searchQuery.value) return certificates.value
  const query = searchQuery.value.toLowerCase()
  return certificates.value.filter(cert =>
    cert.name.toLowerCase().includes(query) ||
    cert.domain.toLowerCase().includes(query) ||
    cert.email.toLowerCase().includes(query) ||
    getSourceLabel(cert.source).toLowerCase().includes(query)
  )
})

// 加载数据
const loadCertificates = async () => {
  if (!currentNodeId.value) return
  loading.value = true
  try {
    const response = await sslAPI.listCerts(currentNodeId.value)
    if (response && response.success) {
      const data = response.data || {}
      const list = Array.isArray(data.certs) ? data.certs : []
      certificates.value = list.map((item, index) => {
        const domains = Array.isArray(item.domains) ? item.domains : []
        let primaryDomain = domains.length > 0 ? domains[0] : item.name || ''
        if (domains.length > 1) primaryDomain += '...'

        return {
          id: item.name || index,
          name: item.name || '',
          domain: primaryDomain,
          email: item.email || '',
          createdAt: item.created_at || '',
          remark: item.remark || '',
          status: item.status || '',
          lastError: item.last_error || '',
          source: item.source || 'other',
        }
      })
    } else {
      throw new Error(response.message || '加载失败')
    }
  } catch (e) {
    ElMessage.error(e.message || '加载证书列表失败')
    certificates.value = []
  } finally {
    loading.value = false
  }
}

// 处理节点选择
const handleNodeSelected = (node) => {
  currentNodeId.value = node.id
  loadCertificates()
}

// 刷新
const handleRefresh = () => {
  loadCertificates()
  ElMessage.success('数据已更新')
}

// 操作处理
const applyCertificate = () => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  showApplyModal.value = true
}

const uploadCertificate = () => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  showUploadModal.value = true
}

const selfSignCertificate = () => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  showSelfSignModal.value = true
}

const repairScan = async () => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  try {
    await ElMessageBox.confirm('确定要进行修复扫描吗？这将重新扫描并修复证书索引。', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    loading.value = true
    const res = await sslAPI.repairIndex(currentNodeId.value)
    if (res.success) {
      ElMessage.success('修复扫描完成')
      loadCertificates()
    } else {
      throw new Error(res.message)
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '修复扫描失败')
  } finally {
    loading.value = false
  }
}

const editCertificate = (cert) => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  currentCert.value = {
    name: cert.name,
    domain: cert.domain
  }
  showSettingsModal.value = true
}

const viewCertificate = (cert) => {
  if (!currentNodeId.value) return ElMessage.warning('请先选择节点')
  currentCert.value = {
    name: cert.name,
    domain: cert.domain
  }
  showViewModal.value = true
}

const deleteCertificate = async (cert) => {
  try {
    await ElMessageBox.confirm(`确定要删除证书 "${cert.domain}" 吗？此操作不可恢复。`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    })
    loading.value = true
    const res = await sslAPI.deleteCert(currentNodeId.value, cert.name)
    if (res.success) {
      ElMessage.success(res.message || '删除成功')
      loadCertificates()
    } else {
      throw new Error(res.message)
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.ssl-certificates-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-bg-color-overlay);
  padding: 16px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.node-select-wrapper {
  width: 220px;
}

.search-input {
  width: 240px;
}

.status-tag {
  cursor: help;
}

.table-container {
  background: var(--el-bg-color-overlay);
  padding: 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

:deep(.el-table) {
  --el-table-header-bg-color: var(--el-fill-color-light);
}

/* 响应式 */
@media (max-width: 1200px) {
  .filter-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .header-left, .header-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
  }
}
</style>
