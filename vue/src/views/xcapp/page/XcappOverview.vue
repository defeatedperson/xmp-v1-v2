<template>
  <div class="xcapp-overview">
    <div class="page-header">
      <div class="page-title">XCC 概览</div>
      <el-button type="primary" @click="$emit('add-domain')">添加域名</el-button>
    </div>

    <el-card shadow="never" class="table-card">
      <el-table :data="domains" class="domain-table" :empty-text="'暂无域名配置'">
        <el-table-column label="域名" min-width="200">
          <template #default="{ row }">
            <div class="domain-cell">
              <div class="domain-name">{{ row.domain }}</div>
              <div v-if="row.origin_host" class="domain-host">{{ row.origin_host }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="origin" label="源站" min-width="200" />
        <el-table-column label="HTTPS" width="140">
          <template #default="{ row }">
            <el-tag size="small" effect="dark" :type="row.https_enabled ? 'success' : 'info'">
              {{ row.https_enabled ? '启用' : '关闭' }}
            </el-tag>
            <el-tag
              v-if="row.https_enabled && row.redirect_http_to_https"
              size="small"
              effect="dark"
              type="warning"
              class="ml-1"
            >
              强制
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="CC防护" width="140">
          <template #default="{ row }">
            <div class="threshold-info">
              <div>域: {{ row.cc_domain_threshold }}</div>
              <div>IP: {{ row.cc_ip_threshold }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="rl_max_req" label="限流" width="100" />
        <el-table-column label="操作" width="140">
          <template #default="{ $index }">
            <el-button-group>
              <el-button size="small" @click="$emit('edit-domain', $index)">设置</el-button>
              <el-button size="small" type="danger" @click="$emit('delete-domain', $index)">删除</el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="nodes-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">边缘节点操作</span>
          <el-button size="small" :loading="nodesLoading" @click="$emit('refresh-nodes')">刷新节点</el-button>
        </div>
      </template>

      <div class="nodes-content">
        <div class="selector-header">
          <el-checkbox :model-value="isAllSelected" :disabled="nodes.length === 0" @change="toggleSelectAll">
            全选
          </el-checkbox>
          <span class="selection-count">已选 {{ selectedNodeIds.length }} / {{ nodes.length }}</span>
        </div>
        <el-checkbox-group v-if="nodes.length > 0" v-model="selectedNodeIds" class="nodes-grid" :disabled="batchRunning">
          <el-checkbox v-for="n in nodes" :key="n.id" :label="String(n.id)">
            节点 {{ n.id }}
          </el-checkbox>
        </el-checkbox-group>
        <el-empty v-else description="暂无可用边缘节点" :image-size="80" />

        <div class="batch-actions">
          <div class="action-group">
            <el-button :disabled="!canStartBatch" @click="startBatch('reload')">重载服务</el-button>
            <el-button :disabled="!canStartBatch" @click="startBatch('apply')">应用配置</el-button>
            <el-button :disabled="!canStartBatch" @click="startBatch('cleanupCerts')">清理旧证书</el-button>
          </div>
          <div class="action-group">
            <el-select v-model="selectedCacheDomain" placeholder="请选择域名" class="domain-select" :disabled="!canStartBatch">
              <el-option v-for="d in domains" :key="d.domain" :label="d.domain" :value="d.domain" />
            </el-select>
            <el-button type="warning" :disabled="!canStartBatch" @click="startBatch('clearCache')">清除缓存</el-button>
          </div>
        </div>

        <el-card v-if="batchRunning || batchLogs.length > 0" shadow="never" class="execution-card">
          <div v-if="batchRunning || batchProgress.total > 0" class="progress-header">
            <div class="progress-info">
              <span>执行进度: {{ batchProgress.completed }} / {{ batchProgress.total }}</span>
              <span v-if="batchProgress.failed > 0" class="failed-count">失败: {{ batchProgress.failed }}</span>
            </div>
            <el-progress :percentage="batchProgressPercent" :status="batchProgress.failed > 0 ? 'exception' : 'success'" />
          </div>

          <el-scrollbar height="200px" class="log-area" ref="logArea">
            <div v-for="(log, idx) in batchLogs" :key="idx" class="log-entry" :class="{ error: !log.success }">
              <span class="log-time">{{ log.timestamp }}</span>
              <span class="log-node">[节点{{ log.nodeId }}]</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
          </el-scrollbar>

          <div class="panel-footer">
            <el-button v-if="batchRunning" type="danger" text @click="cancelBatch">取消操作</el-button>
            <el-button v-else text @click="clearLogs">清空日志</el-button>
          </div>
        </el-card>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ElMessage } from 'element-plus'

export default {
  name: 'XcappOverview',
  props: {
    config: { type: Object, default: () => ({ domains: [] }) },
    nodes: { type: Array, default: () => [] },
    nodesLoading: { type: Boolean, default: false }
  },
  emits: ['add-domain', 'edit-domain', 'delete-domain', 'refresh-nodes'],
  data() {
    return {
      selectedNodeIds: [],
      selectedCacheDomain: '',
      batchRunning: false,
      batchCancelRequested: false,
      batchProgress: { total: 0, completed: 0, failed: 0 },
      batchLogs: []
    }
  },
  computed: {
    domains() {
      return this.config && this.config.domains ? this.config.domains : []
    },
    isAllSelected() {
      return this.nodes.length > 0 && this.selectedNodeIds.length === this.nodes.length
    },
    canStartBatch() {
      return this.selectedNodeIds.length > 0 && !this.batchRunning
    },
    batchProgressPercent() {
      if (this.batchProgress.total === 0) return 0
      return Math.floor((this.batchProgress.completed / this.batchProgress.total) * 100)
    }
  },
  methods: {
    toggleSelectAll(val) {
      if (val) {
        this.selectedNodeIds = this.nodes.map(n => String(n.id))
      } else {
        this.selectedNodeIds = []
      }
    },
    async post(url, body) {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      })
      const result = await resp.json().catch(() => ({}))
      if (resp.ok && result.status === 'ok') {
        return { success: true, data: result }
      }
      return { success: false, status: resp.status, message: result.error || result.message || '请求失败' }
    },
    appendLog(entry) {
      const ts = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const timestamp = `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`
      this.batchLogs.push({ timestamp, ...entry })
      this.$nextTick(() => {
        const el = this.$refs.logArea?.wrapRef
        if (el) el.scrollTop = el.scrollHeight
      })
    },
    clearLogs() {
      this.batchLogs = []
      this.batchProgress = { total: 0, completed: 0, failed: 0 }
    },
    cancelBatch() {
      this.batchCancelRequested = true
    },
    async startBatch(action) {
      if (!this.canStartBatch) return
      if (action === 'clearCache' && !this.selectedCacheDomain) {
        ElMessage.warning('请选择要清理缓存的域名')
        return
      }

      const nodeIds = this.selectedNodeIds.slice()
      this.batchRunning = true
      this.batchCancelRequested = false
      this.batchProgress = { total: nodeIds.length, completed: 0, failed: 0 }
      this.batchLogs = []

      for (const nodeId of nodeIds) {
        if (this.batchCancelRequested) break
        try {
          let r = { success: false, message: '未知操作' }
          if (action === 'reload') {
            r = await this.post(`/api/forward/${nodeId}/admin/reload`, {})
            this.appendLog({ nodeId, action, success: !!r.success, message: r.success ? '重载成功' : (r.message || '重载失败') })
          } else if (action === 'apply') {
            const payload = {
              acl: this.config.acl || { whitelist: [], blacklist: [] },
              domains: this.config.domains || [],
              acme_upstream: this.config.acme_upstream || ''
            }
            r = await this.post(`/api/forward/${nodeId}/admin/config/apply`, payload)
            this.appendLog({ nodeId, action, success: !!r.success, message: r.success ? '配置已推送' : (r.message || '推送失败') })
          } else if (action === 'cleanupCerts') {
            r = await this.post(`/api/forward/${nodeId}/admin/certs/cleanup`, {})
            this.appendLog({ nodeId, action, success: !!r.success, message: r.success ? '证书清理完成' : (r.message || '清理失败') })
          } else if (action === 'clearCache') {
            r = await this.post(`/api/forward/${nodeId}/admin/cache/clear`, { domain: this.selectedCacheDomain })
            this.appendLog({ nodeId, action, success: !!r.success, message: r.success ? '缓存已清空' : (r.message || '清空失败') })
          }
          if (!r.success) this.batchProgress.failed++
        } catch (e) {
          this.appendLog({ nodeId, action, success: false, message: e.message || '请求异常' })
          this.batchProgress.failed++
        } finally {
          this.batchProgress.completed++
        }
      }

      this.batchRunning = false
      if (this.batchCancelRequested) {
        ElMessage.warning('操作已取消')
      } else {
        ElMessage.success('批量操作完成')
      }
    }
  }
}
</script>

<style scoped>
.xcapp-overview {
  color: var(--el-text-color-primary);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.table-card {
  margin-bottom: 16px;
  border-radius: var(--el-border-radius-base);
}

.domain-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.domain-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.domain-host {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.threshold-info {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ml-1 {
  margin-left: 6px;
}

.nodes-card {
  border-radius: var(--el-border-radius-base);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.nodes-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.selection-count {
  color: var(--el-text-color-secondary);
}

.nodes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.action-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.domain-select {
  min-width: 200px;
}

.execution-card {
  border-radius: var(--el-border-radius-base);
}

.progress-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.failed-count {
  color: var(--el-color-danger);
}

.log-area {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 8px 10px;
}

.log-entry {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
}

.log-entry.error {
  color: var(--el-color-danger);
}

.log-time {
  color: var(--el-text-color-secondary);
}

.log-node {
  color: var(--el-color-primary);
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

:deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-card__body) {
  padding: 16px;
}

:deep(.el-table) {
  --el-table-header-bg-color: var(--el-fill-color-light);
}
</style>
