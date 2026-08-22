<template>
  <div class="xcapp-acl">
    <div class="page-header">
      <div class="header-title">黑白名单设置</div>
      <el-button type="primary" @click="handleSave">保存配置</el-button>
    </div>

    <el-alert
      type="info"
      show-icon
      :closable="false"
      title="规则说明"
      description="白名单优先级高于黑名单；支持单个 IP (1.1.1.1) 或 CIDR 网段 (1.1.1.0/24)；每行一个规则；规则不会自动提交边缘节点，需要在概览页面提交同步。"
      class="info-alert"
    />

    <div class="acl-grid">
      <el-card shadow="never" class="acl-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">白名单</span>
            <el-tag size="small" effect="dark">{{ whitelistLines.length }} 条规则</el-tag>
          </div>
        </template>
        <el-input
          v-model="whitelistText"
          type="textarea"
          :autosize="{ minRows: 12 }"
          placeholder="请输入允许访问的 IP 地址，每行一个..."
          spellcheck="false"
          class="code-input"
        />
      </el-card>

      <el-card shadow="never" class="acl-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">黑名单</span>
            <el-tag size="small" effect="dark" type="danger">{{ blacklistLines.length }} 条规则</el-tag>
          </div>
        </template>
        <el-input
          v-model="blacklistText"
          type="textarea"
          :autosize="{ minRows: 12 }"
          placeholder="请输入禁止访问的 IP 地址，每行一个..."
          spellcheck="false"
          class="code-input"
        />
      </el-card>
    </div>
  </div>
</template>

<script>
export default {
  name: 'XcappAcl',
  props: {
    config: { type: Object, default: () => ({ acl: { whitelist: [], blacklist: [] } }) }
  },
  emits: ['save-acl'],
  data() {
    return {
      whitelistText: '',
      blacklistText: ''
    }
  },
  computed: {
    whitelistLines() {
      return this.whitelistText.split('\n').map(s => s.trim()).filter(s => s)
    },
    blacklistLines() {
      return this.blacklistText.split('\n').map(s => s.trim()).filter(s => s)
    }
  },
  watch: {
    config: {
      immediate: true,
      deep: true,
      handler(val) {
        const acl = val && val.acl ? val.acl : { whitelist: [], blacklist: [] }
        this.whitelistText = (acl.whitelist || []).join('\n')
        this.blacklistText = (acl.blacklist || []).join('\n')
      }
    }
  },
  methods: {
    handleSave() {
      this.$emit('save-acl', {
        whitelist: this.whitelistLines,
        blacklist: this.blacklistLines
      })
    }
  }
}
</script>

<style scoped>
.xcapp-acl {
  padding: 10px 20px;
  color: var(--el-text-color-primary);
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.info-alert {
  margin-bottom: 16px;
  border-radius: var(--el-border-radius-base);
}

.acl-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.acl-card {
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

@media (max-width: 768px) {
  .acl-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
