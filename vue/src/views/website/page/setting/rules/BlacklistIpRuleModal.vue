<template>
  <el-dialog
    :model-value="visible"
    title="配置黑名单 IP 规则"
    width="400px"
    @close="handleClose"
  >
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <el-alert
      title="保存后不会自动生效，需要手动点击”让配置生效“按钮"
      type="info"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <el-form label-position="top">
      <div class="rule-list">
        <el-form-item
          v-for="(ip, index) in ipList"
          :key="index"
          :label="index === 0 ? 'IP 地址' : ''"
          class="mb-2"
        >
          <el-input
            v-model="ipList[index]"
            placeholder="例如：1.2.3.4 或 5.6.0.0/16"
          >
            <template #append>
              <el-button
                v-if="ipList.length > 1"
                type="danger"
                link
                @click="removeIp(index)"
              >
                删除
              </el-button>
            </template>
          </el-input>
        </el-form-item>

        <el-button
          type="primary"
          plain
          class="w-full mt-2"
          @click="addIp"
        >
          新增 IP
        </el-button>
      </div>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button :disabled="loading" @click="handleClose">取消</el-button>
        <el-button
          type="primary"
          :loading="loading"
          @click="handleSubmit"
        >
          保存规则
        </el-button>
      </div>
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
const ipList = ref([])

const extractContent = (fullContent) => {
  if (!fullContent) return ''
  const startTag = '# xmp-blacklist_ip-start'
  const endTag = '# xmp-blacklist_ip-end'
  const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`)
  const match = fullContent.match(regex)
  return match ? match[1].trim() : ''
}

const parseIpsFromBlock = (blockContent) => {
  const ips = []
  if (!blockContent) {
    return ips
  }
  const lines = String(blockContent).split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const match = line.match(/^deny\s+(.+?);$/)
    if (match && match[1]) {
      ips.push(match[1])
    }
  }
  return ips
}

const resetLocalState = () => {
  error.value = ''
  const blockContent = extractContent(props.existingContent)
  const parsedIps = parseIpsFromBlock(blockContent)
  if (parsedIps.length > 0) {
    ipList.value = parsedIps
  } else {
    ipList.value = ['']
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

const addIp = () => {
  ipList.value.push('')
}

const removeIp = (index) => {
  if (ipList.value.length <= 1) {
    return
  }
  ipList.value.splice(index, 1)
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
  const ips = ipList.value
    .map((item) => String(item || '').trim())
    .filter((item) => item)
  if (!ips.length) {
    error.value = '请至少填写一个 IP 地址'
    return
  }

  const bodyLines = ips.map((ip) => `deny ${ip};`)
  bodyLines.push('allow all;')

  const bodyText = bodyLines.join('\n')
  const startTag = '# xmp-blacklist_ip-start'
  const endTag = '# xmp-blacklist_ip-end'
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
    ElMessage.success('黑名单 IP 规则已保存')
    emit('saved', { content: newContent })
    emit('close')
  } catch (e) {
    error.value = e.message || '保存黑名单 IP 规则失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.mb-4 {
  margin-bottom: 1rem;
}

.mb-2 {
  margin-bottom: 0.5rem;
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
}

:deep(.el-dialog) {
  background-color: #1e293b;
  border: 1px solid #334155;
}

:deep(.el-dialog__title) {
  color: #f1f5f9;
}

:deep(.el-form-item__label) {
  color: #94a3b8;
}

:deep(.el-input__wrapper) {
  background-color: #0f172a;
  box-shadow: 0 0 0 1px #334155 inset;
}

:deep(.el-input__inner) {
  color: #f1f5f9;
}
</style>
