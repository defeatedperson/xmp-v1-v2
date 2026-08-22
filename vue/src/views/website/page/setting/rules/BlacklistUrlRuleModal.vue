<template>
  <el-dialog
    :model-value="visible"
    title="配置黑名单 URL 规则"
    width="640px"
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
      <div
        v-for="(item, index) in urlList"
        :key="index"
        class="rule-item-card"
      >
        <el-row :gutter="12">
          <el-col :span="8">
            <div class="item-label">匹配模式</div>
            <el-select v-model="urlList[index].mode" placeholder="选择模式" class="w-full">
              <el-option label="具体 URL" value="exact" />
              <el-option label="前缀匹配" value="prefix" />
            </el-select>
          </el-col>
          <el-col :span="12">
            <div class="item-label">URL 路径</div>
            <el-input
              v-model="urlList[index].value"
              :placeholder="item.mode === 'prefix' ? '例如：/admin' : '例如：/login'"
            />
          </el-col>
          <el-col :span="4" class="flex-end-center">
            <el-button
              v-if="urlList.length > 1"
              type="danger"
              link
              @click="removeUrl(index)"
            >
              删除
            </el-button>
          </el-col>
        </el-row>
      </div>

      <el-button
        type="primary"
        class="w-full mt-2"
        @click="addUrl"
      >
        新增 URL
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
const urlList = ref([])

const extractContent = (fullContent) => {
  if (!fullContent) return ''
  const startTag = '# xmp-blacklist_url-start'
  const endTag = '# xmp-blacklist_url-end'
  const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`)
  const match = fullContent.match(regex)
  return match ? match[1].trim() : ''
}

const parseUrlsFromBlock = (blockContent) => {
  const list = []
  if (!blockContent) {
    return list
  }
  const lines = String(blockContent).split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const exactMatch = line.match(/^location\s+=\s+(\S+)/)
    if (exactMatch && exactMatch[1]) {
      list.push({
        mode: 'exact',
        value: exactMatch[1],
      })
      continue
    }
    const prefixMatch = line.match(/^location\s+\^~\s+(\S+)/)
    if (prefixMatch && prefixMatch[1]) {
      list.push({
        mode: 'prefix',
        value: prefixMatch[1],
      })
    }
  }
  return list
}

const resetLocalState = () => {
  error.value = ''
  const blockContent = extractContent(props.existingContent)
  const parsed = parseUrlsFromBlock(blockContent)
  if (parsed.length > 0) {
    urlList.value = parsed
  } else {
    urlList.value = [
      {
        mode: 'exact',
        value: '',
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

const addUrl = () => {
  urlList.value.push({
    mode: 'exact',
    value: '',
  })
}

const removeUrl = (index) => {
  if (urlList.value.length <= 1) {
    return
  }
  urlList.value.splice(index, 1)
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
  const entries = urlList.value
    .map((item) => {
      const mode = item.mode === 'prefix' ? 'prefix' : 'exact'
      const raw = item.value && String(item.value).trim()
      if (!raw) {
        return null
      }
      let value = raw
      if (value.includes('://')) {
        try {
          const u = new URL(value)
          value = u.pathname || '/'
        } catch {
          value = raw
        }
      }
      if (!value.startsWith('/')) {
        value = `/${value}`
      }
      return {
        mode,
        value,
      }
    })
    .filter((item) => item)
  if (!entries.length) {
    error.value = '请至少填写一个 URL'
    return
  }

  const bodyLines = []
  entries.forEach((item) => {
    if (item.mode === 'prefix') {
      bodyLines.push(`location ^~ ${item.value} {`)
    } else {
      bodyLines.push(`location = ${item.value} {`)
    }
    bodyLines.push('  deny all;')
    bodyLines.push('}')
  })

  const bodyText = bodyLines.join('\n')
  const startTag = '# xmp-blacklist_url-start'
  const endTag = '# xmp-blacklist_url-end'
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
    ElMessage.success('黑名单 URL 规则已保存')
    emit('saved', { content: newContent })
    emit('close')
  } catch (e) {
    error.value = e.message || '保存黑名单 URL 规则失败'
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
