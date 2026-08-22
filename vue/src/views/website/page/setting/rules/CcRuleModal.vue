<template>
  <el-dialog
    :model-value="visible"
    title="配置 CC 防护"
    width="560px"
    @update:model-value="val => !val && handleClose()"
    @close="handleClose"
    destroy-on-close
    align-center
  >
    <div v-if="error" class="mb-4">
      <el-alert :title="error" type="error" show-icon :closable="false" />
    </div>

    <el-alert
      title="保存后不会自动生效，请手动点击”让配置生效“按钮"
      type="info"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <el-form label-position="top">
      <el-form-item label="是否启用 CC 防护">
        <el-switch v-model="enabled" />
      </el-form-item>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="IP 封禁阈值">
            <el-input
              v-model="ipXInput"
              type="number"
              placeholder="30秒内请求数 > x 则封禁10分钟"
              :disabled="!enabled"
            >
              <template #append>次</template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="全站 JS 验证阈值">
            <el-input
              v-model="domainYInput"
              type="number"
              placeholder="30秒内总请求数 >= y 则验证10分钟"
              :disabled="!enabled"
            >
              <template #append>次</template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="是否开启严格模式 (必须开启 HTTPS)">
        <el-switch v-model="strictEnabled" :disabled="!enabled" />
      </el-form-item>

      <div class="help-section mt-4">
        <div class="help-title">规则说明</div>
        <div class="help-content">
          <p>• 验证期间全站生效（不影响 IP 限频），封禁返回 444。</p>
          <p>• 严格模式关闭：浏览器无法完成 PoW 时允许降级放行。</p>
          <p>• 严格模式开启：不允许降级，失败累计 5 次封禁 5 分钟。</p>
        </div>
      </div>
    </el-form>

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

const enabled = ref(false)
const strictEnabled = ref(false)
const ipXInput = ref('')
const domainYInput = ref('')

const startTag = '# xmp-cc-start'
const endTag = '# xmp-cc-end'

const extractContent = (fullContent) => {
  if (!fullContent) return ''
  const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`)
  const match = fullContent.match(regex)
  return match ? match[1].trim() : ''
}

const parseIntFromSetLine = (line) => {
  const m = String(line || '').match(/set\s+\$(\S+)\s+(\d+);/)
  if (!m) return null
  return { key: m[1], value: parseInt(m[2], 10) }
}

const resetLocalState = () => {
  error.value = ''
  enabled.value = false
  strictEnabled.value = false
  ipXInput.value = '120'
  domainYInput.value = '3000'

  const block = extractContent(props.existingContent)
  if (!block) return

  enabled.value = true
  const lines = String(block).split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith('set ')) continue
    const kv = parseIntFromSetLine(line)
    if (!kv) continue
    if (kv.key === 'xmp_cc_on') enabled.value = kv.value === 1
    if (kv.key === 'xmp_cc_ip_x') ipXInput.value = String(kv.value)
    if (kv.key === 'xmp_cc_domain_y') domainYInput.value = String(kv.value)
    if (kv.key === 'xmp_cc_strict') strictEnabled.value = kv.value === 1
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) resetLocalState()
  },
)

const handleClose = () => {
  if (loading.value) return
  emit('close')
}

const asPositiveInt = (v) => {
  const n = parseInt(String(v || '').trim(), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

const buildBlock = ({ ipX, domainY, strict }) => {
  const strictValue = strict ? 1 : 0
  const lines = []
  lines.push(startTag)
  lines.push(`set $xmp_cc_on 1;`)
  lines.push(`set $xmp_cc_ip_x ${ipX};`)
  lines.push(`set $xmp_cc_domain_y ${domainY};`)
  lines.push(`set $xmp_cc_strict ${strictValue};`)
  lines.push(`access_by_lua_file /www/lua/xmp_cc_access.lua;`)
  lines.push(`location = /__cc         { content_by_lua_file /www/lua/xmp_cc_page.lua; }`)
  lines.push(`location = /__cc.js      { content_by_lua_file /www/lua/xmp_cc_js.lua; }`)
  lines.push(`location = /__cc/init    { content_by_lua_file /www/lua/xmp_cc_init.lua; }`)
  lines.push(`location = /__cc/verify  { content_by_lua_file /www/lua/xmp_cc_verify.lua; }`)
  lines.push(`location = /__cc/degrade { content_by_lua_file /www/lua/xmp_cc_degrade.lua; }`)
  lines.push(`location = /__cc/recheck { content_by_lua_file /www/lua/xmp_cc_recheck.lua; }`)
  lines.push(endTag)
  return lines.join('\n')
}

const removeBlock = (fullContent) => {
  const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}\\s*`, 'g')
  return String(fullContent || '').replace(regex, '').trim()
}

const upsertBlock = (fullContent, block) => {
  const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`)
  const cur = String(fullContent || '')
  if (regex.test(cur)) {
    return cur.replace(regex, block).trim()
  }
  return (cur ? `${cur}\n\n${block}` : block).trim()
}

const handleSubmit = async () => {
  if (!props.nodeId || !props.site?.id) {
    error.value = '节点ID或站点信息缺失'
    return
  }

  let newContent = props.existingContent || ''

  if (!enabled.value) {
    newContent = removeBlock(newContent)
  } else {
    const ipX = asPositiveInt(ipXInput.value)
    const domainY = asPositiveInt(domainYInput.value)
    if (ipX == null) {
      error.value = '请填写有效的 IP 封禁阈值（正整数）'
      return
    }
    if (domainY == null) {
      error.value = '请填写有效的域名验证阈值（正整数）'
      return
    }
    const block = buildBlock({ ipX, domainY, strict: strictEnabled.value })
    newContent = upsertBlock(newContent, block)
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
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data || data.success !== true) {
      const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
      throw new Error(msg)
    }
    ElMessage.success('CC 防护规则已保存')
    emit('saved', { content: newContent })
    emit('close')
  } catch (e) {
    error.value = e.message || '保存 CC 防护规则失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.mb-4 {
  margin-bottom: 1rem;
}
.mt-4 {
  margin-top: 1rem;
}
.help-section {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}
.help-title {
  font-size: 13px;
  font-weight: bold;
  color: #409eff;
  margin-bottom: 8px;
}
.help-content {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}
.help-content p {
  margin: 4px 0;
}
</style>
