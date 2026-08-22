<template>
  <div class="ssh-settings-page">
    <el-card class="panel-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>SSH模板</span>
          <el-button type="success" plain @click="openAdd">新增模板</el-button>
        </div>
      </template>
      <div class="templates-list">
        <template v-if="templates.length > 0">
          <div v-for="item in templates" :key="item.id" class="template-item">
            <el-form label-position="top" class="template-form">
              <el-row :gutter="16">
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="标题">
                    <el-input v-model="item.title" maxlength="8" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="端口">
                    <el-input-number v-model="item.port" :min="1" :max="65535" class="full-width" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="用户名">
                    <el-input v-model="item.user" maxlength="64" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="密码（允许为空）">
                    <el-input v-model="item.password" type="password" maxlength="128" />
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
            <div class="row-actions">
              <el-button type="primary" @click="handleUpdate(item)">保存</el-button>
              <el-button type="danger" @click="handleDelete(item)">删除</el-button>
            </div>
          </div>
        </template>
        <el-empty v-else description="暂无模板" :image-size="80" />
      </div>
    </el-card>

    <el-card v-if="showAdd" class="panel-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>新增模板</span>
        </div>
      </template>
      <el-form label-position="top" class="template-form">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="标题">
              <el-input v-model="addForm.title" maxlength="8" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="端口">
              <el-input-number v-model="addForm.port" :min="1" :max="65535" class="full-width" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="用户名">
              <el-input v-model="addForm.user" maxlength="64" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="密码（允许为空）">
              <el-input v-model="addForm.password" type="password" maxlength="128" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="action-row">
          <el-button type="primary" @click="handleAddSave">保存</el-button>
          <el-button @click="showAdd = false">取消</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const templates = ref([])
const etag = ref('')
const showAdd = ref(false)
const addForm = ref({ title: '', port: 22, user: '', password: '' })
const MAX_ITEMS = 6

function genId() {
  const ts = Date.now().toString()
  const rand = Math.random().toString(36).slice(2, 8)
  return ts + '_' + rand
}

function trimStr(s) {
  return typeof s === 'string' ? s.trim() : ''
}

function isValidPort(n) {
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

function validateItem(x) {
  const title = trimStr(x.title)
  const user = trimStr(x.user)
  const password = typeof x.password === 'string' ? x.password : ''
  const port = x.port
  if (!title || title.length > 8) return false
  if (!isValidPort(port)) return false
  if (!user || user.length > 64) return false
  if (password && password.length > 128) return false
  return true
}

async function loadTemplates() {
  try {
    const res = await fetch('/api/ssh/templates')
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`)
    templates.value = Array.isArray(data.data) ? data.data.map((t) => ({ ...t, __pwdConfirmed: false })) : []
    etag.value = res.headers.get('etag') || ''
  } catch (e) {
    ElMessage({ message: e.message || '加载失败', type: 'error', duration: 4000 })
  }
}

async function saveAll() {
  try {
    const payload = templates.value.map((t) => ({
      id: t.id,
      title: trimStr(t.title),
      port: t.port,
      user: trimStr(t.user),
      password: t.password || ''
    }))
    if (!payload.every(validateItem)) {
      throw new Error('模板字段不合法或长度超限')
    }
    const res = await fetch('/api/ssh/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(etag.value ? { 'If-Match': etag.value } : {}) },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (res.status === 412) {
      ElMessage({ message: '内容已变更，已重新加载', type: 'warning', duration: 4000 })
      await loadTemplates()
      return false
    }
    if (res.status === 400 && data && data.message) {
      throw new Error(data.message)
    }
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`)
    etag.value = res.headers.get('etag') || ''
    ElMessage({ message: '保存成功', type: 'success', duration: 3000 })
    return true
  } catch (e) {
    ElMessage({ message: e.message || '保存失败', type: 'error', duration: 4000 })
    return false
  }
}

function openAdd() {
  if (templates.value.length >= MAX_ITEMS) {
    ElMessage({ message: '最多只能有6条模板', type: 'error', duration: 4000 })
    return
  }
  addForm.value = { title: '', port: 22, user: '', password: '' }
  showAdd.value = true
}

async function handleAddSave() {
  const item = {
    id: genId(),
    title: trimStr(addForm.value.title),
    port: addForm.value.port,
    user: trimStr(addForm.value.user),
    password: addForm.value.password
  }
  if (!validateItem(item)) {
    ElMessage({ message: '模板字段不合法或长度超限', type: 'error', duration: 4000 })
    return
  }
  if (item.password && item.password.length > 0) {
    try {
      await ElMessageBox.confirm(
        '将把密码保存到主控，可能存在安全风险。更建议在每次使用时手动输入。是否继续保存？',
        '敏感信息提示',
        { confirmButtonText: '继续保存', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
  }
  templates.value.unshift({ ...item, __pwdConfirmed: !!item.password })
  const ok = await saveAll()
  if (ok) showAdd.value = false
  else await loadTemplates()
}

async function handleDelete(item) {
  const idx = templates.value.findIndex((x) => x.id === item.id)
  if (idx !== -1) {
    templates.value.splice(idx, 1)
    const ok = await saveAll()
    if (!ok) await loadTemplates()
  }
}

async function handleUpdate(item) {
  if (!validateItem(item)) {
    ElMessage({ message: '模板字段不合法或长度超限', type: 'error', duration: 4000 })
    return
  }
  if (item.password && item.password.length > 0 && !item.__pwdConfirmed) {
    try {
      await ElMessageBox.confirm(
        '将把密码保存到主控，可能存在安全风险。更建议在每次使用时手动输入。是否继续保存？',
        '敏感信息提示',
        { confirmButtonText: '继续保存', cancelButtonText: '取消', type: 'warning' }
      )
      item.__pwdConfirmed = true
    } catch {
      return
    }
  }
  const ok = await saveAll()
  if (!ok) await loadTemplates()
}

onMounted(() => {
  loadTemplates()
})
</script>

<style scoped>
.ssh-settings-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-card {
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 500;
}

.templates-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-item {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 12px;
}

.template-form {
  margin-top: 4px;
}

.full-width {
  width: 100%;
}

.row-actions,
.action-row {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
</style>
