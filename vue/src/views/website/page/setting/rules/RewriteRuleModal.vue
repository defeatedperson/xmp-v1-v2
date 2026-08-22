<template>
  <el-dialog
    :model-value="visible"
    title="配置伪静态规则"
    width="640px"
    @update:model-value="val => !val && handleClose()"
    @close="handleClose"
    destroy-on-close
    align-center
  >
    <div class="modal-body-content">
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

      <div class="form-group mb-4">
        <div class="item-label mb-2">规则模板</div>
        <el-select
          v-model="selectedPreset"
          placeholder="请选择规则模板"
          class="w-full"
          filterable
        >
          <el-option label="自定义规则" value="" />
          <el-option
            v-for="item in presetOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </div>

      <div class="form-group">
        <div class="item-label mb-2">规则内容</div>
        <el-input
          v-model="localBody"
          type="textarea"
          :rows="12"
          placeholder="在此粘贴或编写 nginx 伪静态规则内容"
          spellcheck="false"
          class="code-textarea"
        />
      </div>
    </div>

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
const localBody = ref('')
const selectedPreset = ref('')

const presetOptions = [
  {
    value: 'wordpress',
    label: 'wordpress',
    content: `location / {
  try_files $uri $uri/ /index.php?$args;
}

rewrite /wp-admin$ $scheme://$host$uri/ permanent;`,
  },
  {
    value: 'wordpress2',
    label: 'wp2',
    content: `rewrite ^.*/files/(.*)$ /wp-includes/ms-files.php?file=$1 last;
if (!-e $request_filename){
  rewrite ^.+?(/wp-.*) $1 last;
  rewrite ^.+?(/.*\\.php)$ $1 last;
  rewrite ^ /index.php last;
}`,
  },
  {
    value: 'typecho',
    label: 'typecho',
    content: `if (!-e $request_filename) {
  rewrite ^(.*)$ /index.php$1 last;
}`,
  },
  {
    value: 'typecho2',
    label: 'typecho2',
    content: `location /typecho/ {
  if (!-e $request_filename) {
    rewrite ^(.*)$ /typecho/index.php$1 last;
  }
}`,
  },
  {
    value: 'thinkphp',
    label: 'thinkphp',
    content: `location ~* (runtime|application)/ {
  return 403;
}
location / {
  if (!-e $request_filename){
    rewrite  ^(.*)$  /index.php?s=$1  last;   break;
  }
}`,
  },
  {
    value: 'yii2',
    label: 'yii2',
    content: `location / {
  try_files  $uri $uri/ /index.php$is_args$args;
}`,
  },
  {
    value: 'laravel5',
    label: 'laravel5',
    content: `location / {
  try_files $uri $uri/ /index.php?$query_string;
}`,
  },
  {
    value: 'discuz',
    label: 'discuz',
    content: `location / {
  rewrite ^/archiver/((fid|tid)-[\\w\\-]+\\.html)$ /archiver/index.php?$1 last;
  rewrite ^/forum-([0-9]+)-([0-9]+)\\.html$ /forumdisplay.php?fid=$1&page=$2 last;
  rewrite ^/thread-([0-9]+)-([0-9]+)-([0-9]+)\\.html$ /viewthread.php?tid=$1&extra=page%3D$3&page=$2 last;
  rewrite ^/space-(username|uid)-(.+)\\.html$ /space.php?$1=$2 last;
  rewrite ^/tag-(.+)\\.html$ /tag.php?name=$1 last;
}`,
  },
  {
    value: 'discuzx',
    label: 'discuzx',
    content: `rewrite ^([^\\.]*)/topic-(.+)\\.html$ $1/portal.php?mod=topic&topic=$2 last;
rewrite ^([^\\.]*)/article-([0-9]+)-([0-9]+)\\.html$ $1/portal.php?mod=view&aid=$2&page=$3 last;
rewrite ^([^\\.]*)/forum-(\\w+)-([0-9]+)\\.html$ $1/forum.php?mod=forumdisplay&fid=$2&page=$3 last;
rewrite ^([^\\.]*)/thread-([0-9]+)-([0-9]+)-([0-9]+)\\.html$ $1/forum.php?mod=viewthread&tid=$2&extra=page%3D$4&page=$3 last;
rewrite ^([^\\.]*)/group-([0-9]+)-([0-9]+)\\.html$ $1/forum.php?mod=group&fid=$2&page=$3 last;
rewrite ^([^\\.]*)/space-(username|uid)-(.+)\\.html$ $1/home.php?mod=space&$2=$3 last;
rewrite ^([^\\.]*)/blog-([0-9]+)-([0-9]+)\\.html$ $1/home.php?mod=space&uid=$2&do=blog&id=$3 last;
rewrite ^([^\\.]*)/(fid|tid)-([0-9]+)\\.html$ $1/index.php?action=$2&value=$3 last;
rewrite ^([^\\.]*)/([a-z]+[a-z0-9_]*)-([a-z0-9_\\-]+)\\.html$ $1/plugin.php?id=$2:$3 last;
if (!-e $request_filename) {
  return 404;
}`,
  },
  {
    value: 'discuzx2',
    label: 'discuzx2',
    content: `location /bbs/ {
  rewrite ^([^\\.]*)/topic-(.+)\\.html$ $1/portal.php?mod=topic&topic=$2 last;
  rewrite ^([^\\.]*)/article-([0-9]+)-([0-9]+)\\.html$ $1/portal.php?mod=view&aid=$2&page=$3 last;
  rewrite ^([^\\.]*)/forum-(\\w+)-([0-9]+)\\.html$ $1/forum.php?mod=forumdisplay&fid=$2&page=$3 last;
  rewrite ^([^\\.]*)/thread-([0-9]+)-([0-9]+)-([0-9]+)\\.html$ $1/forum.php?mod=viewthread&tid=$2&extra=page%3D$4&page=$3 last;
  rewrite ^([^\\.]*)/group-([0-9]+)-([0-9]+)\\.html$ $1/forum.php?mod=group&fid=$2&page=$3 last;
  rewrite ^([^\\.]*)/space-(username|uid)-(.+)\\.html$ $1/home.php?mod=space&$2=$3 last;
  rewrite ^([^\\.]*)/blog-([0-9]+)-([0-9]+)\\.html$ $1/home.php?mod=space&uid=$2&do=blog&id=$3 last;
  rewrite ^([^\\.]*)/(fid|tid)-([0-9]+)\\.html$ $1/index.php?action=$2&value=$3 last;
  rewrite ^([^\\.]*)/([a-z]+[a-z0-9_]*)-([a-z0-9_\\-]+)\\.html$ $1/plugin.php?id=$2:$3 last;
  if (!-e $request_filename) {
    return 404;
  }
}`,
  },
  {
    value: 'discuzx3',
    label: 'discuzx3',
    content: `location / {
  rewrite ^([^\\.]*)/topic-(.+)\\.html$ $1/portal.php?mod=topic&topic=$2 last;
  rewrite ^([^\\.]*)/article-([0-9]+)-([0-9]+)\\.html$ $1/portal.php?mod=view&aid=$2&page=$3 last;
  rewrite ^([^\\.]*)/forum-(\\w+)-([0-9]+)\\.html$ $1/forum.php?mod=forumdisplay&fid=$2&page=$3 last;
  rewrite ^([^\\.]*)/thread-([0-9]+)-([0-9]+)-([0-9]+)\\.html$ $1/forum.php?mod=viewthread&tid=$2&extra=page%3D$4&page=$3 last;
  rewrite ^([^\\.]*)/group-([0-9]+)-([0-9]+)\\.html$ $1/forum.php?mod=group&fid=$2&page=$3 last;
  rewrite ^([^\\.]*)/space-(username|uid)-(.+)\\.html$ $1/home.php?mod=space&$2=$3 last;
  rewrite ^([^\\.]*)/blog-([0-9]+)-([0-9]+)\\.html$ $1/home.php?mod=space&uid=$2&do=blog&id=$3 last;
  rewrite ^([^\\.]*)/(fid|tid)-([0-9]+)\\.html$ $1/index.php?action=$2&value=$3 last;
  rewrite ^([^\\.]*)/([a-z]+[a-z0-9_]*)-([a-z0-9_\\-]+)\\.html$ $1/plugin.php?id=$2:$3 last;
  if (!-e $request_filename) {
    return 404;
  }
}`,
  },
  {
    value: 'zblog',
    label: 'zblog',
    content: `if (-f $request_filename/index.html){
  rewrite (.*) $1/index.html break;
}
if (-f $request_filename/index.php){
  rewrite (.*) $1/index.php;
}
if (!-f $request_filename){
  rewrite (.*) /index.php;
}`,
  },
  {
    value: 'vue',
    label: 'vue项目',
    content: `location / {
  try_files $uri $uri/ /index.html;
}`,
  },
]

const extractContent = (fullContent) => {
  if (!fullContent) return ''
  const startTag = '# xmp-rewrite-start'
  const endTag = '# xmp-rewrite-end'
  const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`)
  const match = fullContent.match(regex)
  return match ? match[1].trim() : ''
}

const resetLocalState = () => {
  error.value = ''
  selectedPreset.value = ''
  localBody.value = extractContent(props.existingContent)
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      resetLocalState()
    }
  },
)

watch(
  () => selectedPreset.value,
  (value) => {
    const preset = presetOptions.find((item) => item.value === value)
    if (preset) {
      localBody.value = preset.content
    }
  },
)

const handleClose = () => {
  if (loading.value) return
  emit('close')
}

const handleSubmit = async () => {
  if (!props.nodeId || !props.site?.id) {
    error.value = '节点ID或站点信息缺失'
    return
  }
  if (!localBody.value || !localBody.value.trim()) {
    error.value = '请填写规则内容'
    return
  }

  const bodyText = String(localBody.value).trim()
  const startTag = '# xmp-rewrite-start'
  const endTag = '# xmp-rewrite-end'
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
    ElMessage.success('伪静态规则已保存')
    emit('saved', { content: newContent })
    emit('close')
  } catch (e) {
    error.value = e.message || '保存伪静态规则失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.modal-body-content {
  padding: 8px 0;
}

.item-label {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
}

.w-full {
  width: 100%;
}

.mb-2 {
  margin-bottom: 8px;
}

.mb-4 {
  margin-bottom: 16px;
}

:deep(.el-textarea__inner) {
  background-color: #0f172a;
  border-color: #334155;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
}

:deep(.el-textarea__inner:focus) {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

