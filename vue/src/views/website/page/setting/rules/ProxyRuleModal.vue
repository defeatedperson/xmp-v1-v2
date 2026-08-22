<template>
  <el-dialog
    :model-value="visible"
    title="配置反向代理规则"
    width="800px"
    @update:model-value="val => !val && handleClose()"
    @close="handleClose"
    destroy-on-close
    align-center
  >
    <div v-if="error" class="mb-4">
      <el-alert :title="error" type="error" show-icon :closable="false" />
    </div>

    <el-alert
      title="保存后不会自动生效，需要手动点击”让配置生效“按钮"
      type="info"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <div class="rule-list">
      <div v-for="(item, index) in ruleList" :key="index" class="rule-item-card">
        <el-row :gutter="12">
          <el-col :span="5">
            <div class="item-label">路径前缀</div>
            <el-input v-model="item.pathPrefix" placeholder="/api" />
          </el-col>
          <el-col :span="4">
            <div class="item-label">协议</div>
            <el-select v-model="item.targetProtocol" class="w-full">
              <el-option label="http" value="http" />
              <el-option label="https" value="https" />
            </el-select>
          </el-col>
          <el-col :span="8">
            <div class="item-label">目标主机</div>
            <el-input v-model="item.targetHost" placeholder="127.0.0.1" />
          </el-col>
          <el-col :span="4">
            <div class="item-label">端口</div>
            <el-input v-model="item.targetPort" type="number" placeholder="8080" />
          </el-col>
          <el-col :span="3" class="flex-end-center">
            <el-button
              v-if="ruleList.length > 1"
              type="danger"
              link
              @click="removeRule(index)"
            >
              删除
            </el-button>
          </el-col>
        </el-row>
      </div>

      <el-button type="primary" class="w-full mt-2" @click="addRule">
        新增反向代理规则
      </el-button>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose" :disabled="loading">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="loading">
          保存规则
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  nodeId: {
    type: String,
    default: '',
  },
  site: {
    type: Object,
    default: null,
  },
  existingContent: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['close', 'saved'])

const loading = ref(false)
const error = ref('')
const ruleList = ref([])

const extractContent = (fullContent) => {
  if (!fullContent) return ''
  const startTag = '# xmp-proxy-start'
  const endTag = '# xmp-proxy-end'
  const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`)
  const match = fullContent.match(regex)
  return match ? match[1].trim() : ''
}

const parseRulesFromBlock = (blockContent) => {
  const rules = []
  if (!blockContent) return rules

  const regex = /location\s+(\S+)\s+\{[\s\S]*?proxy_pass\s+(https?):\/\/([^:;]+):(\d+);/g
  let match
  while ((match = regex.exec(blockContent)) !== null) {
    rules.push({
      pathPrefix: match[1],
      targetProtocol: match[2],
      targetHost: match[3],
      targetPort: match[4],
    })
  }
  return rules
}

const resetLocalState = () => {
  error.value = ''
  const blockContent = extractContent(props.existingContent)
  const parsed = parseRulesFromBlock(blockContent)
  if (parsed.length > 0) {
    ruleList.value = parsed
  } else {
    ruleList.value = [
      {
        pathPrefix: '/api',
        targetProtocol: 'http',
        targetHost: '127.0.0.1',
        targetPort: '8080',
      },
    ]
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      resetLocalState()
    }
  },
)

const addRule = () => {
  ruleList.value.push({
    pathPrefix: '/api',
    targetProtocol: 'http',
    targetHost: '',
    targetPort: '',
  })
}

const removeRule = (index) => {
  if (ruleList.value.length <= 1) return
  ruleList.value.splice(index, 1)
}

const handleClose = () => {
  if (loading.value) return
  emit('close')
}

const handleSubmit = async () => {
  if (!props.nodeId || !props.site?.id) {
    error.value = '节点ID或站点信息缺失'
    return
  }

  const validRules = []
  for (const rule of ruleList.value) {
    const protocol = rule.targetProtocol === 'https' ? 'https' : 'http'
    const host = rule.targetHost && String(rule.targetHost).trim()
    const port = rule.targetPort && String(rule.targetPort).trim()
    let prefix = rule.pathPrefix && String(rule.pathPrefix).trim()

    if (!host || !port) continue

    if (!prefix) prefix = '/'
    if (!prefix.startsWith('/')) prefix = `/${prefix}`
    if (prefix.length > 1 && !prefix.endsWith('/')) prefix = `${prefix}/`

    validRules.push({ prefix, protocol, host, port })
  }

  if (validRules.length === 0) {
    error.value = '请至少填写一个完整的反向代理规则'
    return
  }

  const bodyLines = []
  for (const rule of validRules) {
    bodyLines.push(`location ${rule.prefix} {`)
    bodyLines.push(`  proxy_pass ${rule.protocol}://${rule.host}:${rule.port};`)
    bodyLines.push('  proxy_set_header Host $host;')
    bodyLines.push('  proxy_set_header X-Real-IP $remote_addr;')
    bodyLines.push('  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;')
    bodyLines.push('}')
  }

  const bodyText = bodyLines.join('\n')
  const startTag = '# xmp-proxy-start'
  const endTag = '# xmp-proxy-end'
  const newBlock = `${startTag}\n${bodyText}\n${endTag}`

  let newContent = props.existingContent || ''
  const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`)

  if (regex.test(newContent)) {
    newContent = newContent.replace(regex, newBlock)
  } else {
    newContent = newContent ? `${newContent}\n\n${newBlock}` : newBlock
  }

  loading.value = true
  error.value = ''
  try {
    const domain = props.site.primaryDomain || props.site.id
    const url = `/api/forward/${props.nodeId}/sites/${encodeURIComponent(domain)}/config/official`
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: newContent }),
    })
    let data = null
    try {
      data = await resp.json()
    } catch {
      data = null
    }
    if (!resp.ok || !data || data.success !== true) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    ElMessage.success('反向代理规则已保存')
    emit('saved', { content: newContent })
    emit('close')
  } catch (e) {
    error.value = e.message || '保存反向代理规则失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.mb-4 {
  margin-bottom: 1rem;
}
.mt-2 {
  margin-top: 0.5rem;
}
.w-full {
  width: 100%;
}
.rule-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rule-item-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
}
.item-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}
.flex-end-center {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
  padding-top: 20px;
}
</style>
