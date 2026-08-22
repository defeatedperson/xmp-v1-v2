<template>
  <div class="xcapp-ssl">

    <el-card shadow="never" class="section-card">
      <template #header>自动 SSL (ACME)</template>
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="自动 SSL"
        description="自动SSL功能后续更新，敬请期待。"
      />
    </el-card>

    <el-card shadow="never" class="section-card">
      <template #header>证书分发</template>
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="提示"
        description="此功能将证书和私钥推送到选定的边缘节点。请确保节点在线。"
        class="mb-12"
      />

      <div class="upload-grid">
        <el-form label-position="top" class="upload-form">
          <el-form-item label="目标域名 *">
            <el-input v-model="certForm.domain" placeholder="example.com" />
          </el-form-item>
          <el-form-item label="证书内容 (PEM / Fullchain) *">
            <el-input
              v-model="certForm.public_pem"
              type="textarea"
              :autosize="{ minRows: 5 }"
              placeholder="-----BEGIN CERTIFICATE-----..."
              class="code-input"
            />
          </el-form-item>
          <el-form-item label="私钥内容 (PEM) *">
            <el-input
              v-model="certForm.private_pem"
              type="textarea"
              :autosize="{ minRows: 5 }"
              placeholder="-----BEGIN PRIVATE KEY-----..."
              class="code-input"
            />
          </el-form-item>
          <div class="toggle-row">
            <span class="toggle-label">上传后自动重载节点服务</span>
            <el-switch v-model="certForm.reloadAfter" />
          </div>
        </el-form>

        <el-card shadow="never" class="node-card">
          <div class="node-header">
            <el-checkbox :model-value="isAllNodesSelected" :disabled="nodes.length === 0" @change="toggleSelectAllNodes">
              选择目标节点 ({{ selectedNodeIds.length }})
            </el-checkbox>
          </div>
          <el-checkbox-group v-if="nodes.length > 0" v-model="selectedNodeIds" class="node-list">
            <el-checkbox v-for="n in nodes" :key="n.id" :label="String(n.id)">
              节点 {{ n.id }}
            </el-checkbox>
          </el-checkbox-group>
          <el-empty v-else description="无可用节点" :image-size="80" />
          <div class="deploy-action">
            <el-button type="primary" class="full-width" :disabled="!canDeploy" @click="handleDeploy">
              开始分发
            </el-button>
          </div>
        </el-card>
      </div>

      <el-card v-if="logs.length > 0" shadow="never" class="logs-card">
        <template #header>
          <div class="log-header">
            <span>分发日志</span>
            <el-button text @click="logs = []">清空</el-button>
          </div>
        </template>
        <el-scrollbar height="200px" ref="logArea">
          <div v-for="(l, i) in logs" :key="i" class="log-line" :class="{ error: !l.success }">
            <span class="time">{{ l.time }}</span>
            <span class="node">[节点{{ l.nodeId }}]</span>
            <span class="msg">{{ l.message }}</span>
          </div>
        </el-scrollbar>
      </el-card>
    </el-card>
  </div>
</template>

<script>
import { ElMessage } from 'element-plus'

export default {
  name: 'XcappSsl',
  props: {
    config: { type: Object, default: () => ({}) },
    nodes: { type: Array, default: () => [] }
  },
  data() {
    return {
      loading: false,
      certForm: {
        domain: '',
        public_pem: '',
        private_pem: '',
        reloadAfter: true
      },
      selectedNodeIds: [],
      logs: []
    }
  },
  computed: {
    isAllNodesSelected() {
      return this.nodes.length > 0 && this.selectedNodeIds.length === this.nodes.length
    },
    canDeploy() {
      return this.selectedNodeIds.length > 0 &&
             this.certForm.domain &&
             this.certForm.public_pem &&
             this.certForm.private_pem &&
             !this.loading
    }
  },
  methods: {
    toggleSelectAllNodes(val) {
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
    appendLog(nodeId, success, message) {
      const time = new Date().toLocaleTimeString()
      this.logs.push({ time, nodeId, success, message })
      this.$nextTick(() => {
        const el = this.$refs.logArea?.wrapRef
        if (el) el.scrollTop = el.scrollHeight
      })
    },
    async handleDeploy() {
      if (!this.canDeploy) return

      this.loading = true
      this.logs = []
      const { domain, public_pem, private_pem, reloadAfter } = this.certForm

      for (const nodeId of this.selectedNodeIds) {
        try {
          const r1 = await this.post(`/api/forward/${nodeId}/admin/certs/upload`, { domain, public_pem, private_pem })
          this.appendLog(nodeId, !!r1.success, r1.success ? '证书上传成功' : (r1.message || '上传失败'))

          if (r1.success && reloadAfter) {
            const r2 = await this.post(`/api/forward/${nodeId}/admin/reload`, {})
            this.appendLog(nodeId, !!r2.success, r2.success ? '服务重载成功' : (r2.message || '重载失败'))
          }
        } catch (e) {
          this.appendLog(nodeId, false, e.message || '请求异常')
        }
      }

      this.loading = false
      ElMessage.success('分发任务完成')
    }
  }
}
</script>

<style scoped>
.xcapp-ssl {
  padding: 10px 20px;
  color: var(--el-text-color-primary);
  max-width: 1100px;
  margin: 0 auto;
}

.section-card {
  border-radius: var(--el-border-radius-base);
  margin-bottom: 16px;
}

.mb-12 {
  margin-bottom: 12px;
}

.upload-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

.upload-form {
  display: flex;
  flex-direction: column;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.toggle-label {
  color: var(--el-text-color-regular);
}

.node-card {
  border-radius: var(--el-border-radius-base);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.node-header {
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow: auto;
}

.deploy-action {
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.full-width {
  width: 100%;
}

.logs-card {
  margin-top: 16px;
  border-radius: var(--el-border-radius-base);
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-line {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
}

.log-line.error {
  color: var(--el-color-danger);
}

.log-line .time {
  color: var(--el-text-color-secondary);
}

.log-line .node {
  color: var(--el-color-primary);
}

.code-input :deep(.el-textarea__inner) {
  font-family: var(--el-font-family-mono);
}

:deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-card__body) {
  padding: 16px;
}

@media (max-width: 900px) {
  .upload-grid {
    grid-template-columns: 1fr;
  }
}
</style>
