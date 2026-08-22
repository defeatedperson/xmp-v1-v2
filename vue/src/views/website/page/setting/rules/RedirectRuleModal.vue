<template>
  <el-dialog
    :model-value="visible"
    title="配置重定向规则"
    width="850px"
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
        <el-row :gutter="12" align="bottom">
          <el-col :span="3">
            <div class="item-label">类型</div>
            <el-select v-model="item.redirectType" class="w-full">
              <el-option label="域名" value="domain" />
              <el-option label="404" value="not_found" />
              <el-option label="路径" value="path" />
            </el-select>
          </el-col>
          <el-col :span="6" v-if="item.redirectType !== 'not_found'">
            <div class="item-label">{{ item.redirectType === 'domain' ? '域名' : '路径' }}</div>
            <el-input
              v-model="item.sourceValue"
              :placeholder="item.redirectType === 'domain' ? 'old.example.com' : '/old-path'"
            />
          </el-col>
          <el-col :span="3">
            <div class="item-label">方式</div>
            <el-select v-model="item.statusCode" class="w-full">
              <el-option label="301" value="301" />
              <el-option label="302" value="302" />
            </el-select>
          </el-col>
          <el-col :span="7">
            <div class="item-label">目标 URL</div>
            <el-input
              v-model="item.targetUrl"
              placeholder="https://example.com/new"
            />
          </el-col>
          <el-col :span="3" class="flex-column-center">
            <div class="item-label">保留参数</div>
            <el-switch v-model="item.keepQuery" />
          </el-col>
          <el-col :span="2" class="flex-end-center">
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
        新增重定向规则
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
  const startTag = '# xmp-redirect-start'
  const endTag = '# xmp-redirect-end'
  const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`)
  const match = fullContent.match(regex)
  return match ? match[1].trim() : ''
}

const parseRulesFromBlock = (blockContent) => {
  const rules = []
  if (!blockContent) return rules

  const lines = String(blockContent).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    const domainMatch = line.match(/^if\s+\(\$host\s+=\s+(\S+)\)\s+\{\s*return\s+(301|302)\s+(\S+)(?:\$request_uri|\$uri);\s*\}/)
    if (domainMatch) {
      const targetRaw = domainMatch[3]
      const keepQuery = line.includes('$request_uri')
      rules.push({
        redirectType: 'domain',
        sourceValue: domainMatch[1],
        statusCode: domainMatch[2],
        targetUrl: targetRaw,
        keepQuery,
      })
      continue
    }

    const pathMatch = line.match(/^location\s+=\s+(\S+)\s+\{\s*return\s+(301|302)\s+(\S+)(?:\$is_args\$args)?;\s*\}/)
    if (pathMatch && !line.includes('__xmp_redirect_404')) {
      const targetRaw = pathMatch[3]
      const keepQuery = line.includes('$is_args$args')
      rules.push({
        redirectType: 'path',
        sourceValue: pathMatch[1],
        statusCode: pathMatch[2],
        targetUrl: targetRaw,
        keepQuery,
      })
      continue
    }

    if (line.includes('error_page 404 = /__xmp_redirect_404;')) {
      let j = i
      while (j < lines.length && j < i + 5) {
        const subLine = lines[j].trim()
        const match404 = subLine.match(/location\s+=\s+\/__xmp_redirect_404\s+\{\s*return\s+(301|302)\s+(\S+)(?:\$is_args\$args)?;\s*\}/)
        if (match404) {
          const targetRaw = match404[2]
          const keepQuery = subLine.includes('$is_args$args')
          rules.push({
            redirectType: 'not_found',
            sourceValue: '',
            statusCode: match404[1],
            targetUrl: targetRaw,
            keepQuery,
          })
          i = j
          break
        }
        j++
      }
    }
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
        redirectType: 'domain',
        sourceValue: '',
        statusCode: '301',
        targetUrl: '',
        keepQuery: true,
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
    redirectType: 'domain',
    sourceValue: '',
    statusCode: '301',
    targetUrl: '',
    keepQuery: true,
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
    const target = rule.targetUrl && String(rule.targetUrl).trim()
    if (!target) continue

    if (rule.redirectType === 'domain') {
      const source = rule.sourceValue && String(rule.sourceValue).trim()
      if (!source) continue
      validRules.push({ ...rule, sourceValue: source, targetUrl: target })
    } else if (rule.redirectType === 'path') {
      let source = rule.sourceValue && String(rule.sourceValue).trim()
      if (!source) continue
      if (!source.startsWith('/')) source = `/${source}`
      validRules.push({ ...rule, sourceValue: source, targetUrl: target })
    } else if (rule.redirectType === 'not_found') {
      validRules.push({ ...rule, targetUrl: target })
    }
  }

  if (validRules.length === 0) {
    error.value = '请至少填写一个完整的重定向规则'
    return
  }

  const bodyLines = []
  for (const rule of validRules) {
    const code = rule.statusCode === '302' ? 302 : 301
    const target = rule.targetUrl

    if (rule.redirectType === 'domain') {
      const suffix = rule.keepQuery ? '$request_uri' : '$uri'
      bodyLines.push(`if ($host = ${rule.sourceValue}) { return ${code} ${target}${suffix}; }`)
    } else if (rule.redirectType === 'path') {
      const appendArgs = rule.keepQuery ? '$is_args$args' : ''
      bodyLines.push(`location = ${rule.sourceValue} { return ${code} ${target}${appendArgs}; }`)
    } else if (rule.redirectType === 'not_found') {
      const appendArgs = rule.keepQuery ? '$is_args$args' : ''
      bodyLines.push(`error_page 404 = /__xmp_redirect_404;`)
      bodyLines.push(`location = /__xmp_redirect_404 { return ${code} ${target}${appendArgs}; }`)
    }
  }

  const bodyText = bodyLines.join('\n')
  const startTag = '# xmp-redirect-start'
  const endTag = '# xmp-redirect-end'
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
    ElMessage.success('重定向规则已保存')
    emit('saved', { content: newContent })
    emit('close')
  } catch (e) {
    error.value = e.message || '保存重定向规则失败'
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
  white-space: nowrap;
}
.flex-end-center {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.flex-column-center {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
