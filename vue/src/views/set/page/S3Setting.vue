<template>
  <div class="s3-setting-page">
    <div class="page-content">
      <el-card class="box-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <div class="header-left">
              <h3>S3 配置</h3>
              <p class="subtitle">配置 S3 兼容对象存储</p>
            </div>
            <div class="header-right">
              <NodeSelector :node-type="1" @node-selected="handleNodeSelected" @error="handleNodeError" />
            </div>
          </div>
        </template>

        <div v-if="!currentNodeId" class="empty-state">
          <el-empty description="请先选择一个节点，再进行对象存储配置" />
        </div>

        <div v-else class="card-body">
          <el-form :model="form" label-position="top" class="setting-form">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="配置名称">
                  <el-input v-model="form.name" placeholder="例如：默认对象存储" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="Endpoint">
                  <el-input v-model="form.endpoint" placeholder="例如：https://minio.example.com 或 minio.local:9000" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="Bucket">
                  <el-input v-model="form.bucket" placeholder="目标存储桶名称" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="Access Key ID">
                  <el-input v-model="form.accessKeyId" placeholder="访问密钥 ID" />
                </el-form-item>
              </el-col>
            </el-row>
            
             <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="Secret Access Key">
                   <el-input v-model="form.secretAccessKey" type="password" show-password placeholder="访问密钥 Secret" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-collapse v-model="activeCollapse" class="mb-4">
              <el-collapse-item title="高级设置" name="1">
                 <div class="advanced-settings">
                   <el-row :gutter="20">
                    <el-col :span="12">
                      <el-form-item label="Region">
                        <el-input v-model="form.region" placeholder="可选，AWS S3 建议填写区域" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="下载链接有效期（秒）">
                        <el-input-number v-model="form.downloadExpireSeconds" :min="60" style="width: 100%" />
                      </el-form-item>
                    </el-col>
                   </el-row>
                   
                   <el-form-item>
                     <div class="switch-item">
                        <span class="switch-label">使用 Path-Style 访问（兼容服务）</span>
                        <el-switch v-model="form.pathStyle" />
                     </div>
                   </el-form-item>

                   <el-form-item>
                     <div class="switch-item">
                        <span class="switch-label">使用 HTTPS（SSL）</span>
                        <el-switch v-model="form.useSSL" />
                     </div>
                   </el-form-item>
                 </div>
              </el-collapse-item>
            </el-collapse>

            <div class="form-actions">
              <el-button type="primary" :loading="loading" :disabled="!currentNodeId" @click="saveConfig">
                保存配置
              </el-button>
              <el-button :loading="loading" :disabled="!currentNodeId" @click="loadConfig">
                重新加载
              </el-button>
            </div>
          </el-form>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import NodeSelector from '@/components/NodeSelector.vue'

const currentNodeId = ref('')
const loading = ref(false)
const activeCollapse = ref([])

const form = reactive({
  name: 'default',
  endpoint: '',
  region: '',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  pathStyle: true,
  useSSL: true,
  downloadExpireSeconds: 3600,
})

const handleNodeSelected = (node) => {
  currentNodeId.value = node && node.id ? String(node.id) : ''
  if (currentNodeId.value) {
    loadConfig()
  }
}

const handleNodeError = () => {
  currentNodeId.value = ''
}

const applyConfigToForm = (config) => {
  try {
    const version = Number(config && config.version ? config.version : 1)
    if (version >= 2 && Array.isArray(config.profiles) && config.profiles.length > 0) {
      const profile = config.profiles[0]
      form.name = profile.name || 'default'
      form.endpoint = profile.endpoint || ''
      form.region = profile.region || ''
      form.bucket = profile.bucket || ''
      form.accessKeyId = profile.accessKeyId || ''
      form.secretAccessKey = profile.secretAccessKey || ''
      form.pathStyle = Boolean(profile.pathStyle)
      form.useSSL = profile.useSSL !== false
      form.downloadExpireSeconds = Number(
        profile.downloadExpireSeconds && profile.downloadExpireSeconds > 0
          ? profile.downloadExpireSeconds
          : 3600,
      )
    } else {
      form.name = 'default'
      form.endpoint = config.endpoint || ''
      form.region = config.region || ''
      form.bucket = config.bucket || ''
      form.accessKeyId = config.accessKeyId || ''
      form.secretAccessKey = config.secretAccessKey || ''
      form.pathStyle = Boolean(config.pathStyle)
      form.useSSL = config.useSSL !== false
      form.downloadExpireSeconds = Number(
        config.downloadExpireSeconds && config.downloadExpireSeconds > 0
          ? config.downloadExpireSeconds
          : 3600,
      )
    }
  } catch (e) {
    console.error(e)
  }
}

const buildConfigFromForm = () => {
  const profile = {
    id: 1,
    name: form.name || 'default',
    endpoint: form.endpoint || '',
    region: form.region || '',
    bucket: form.bucket || '',
    accessKeyId: form.accessKeyId || '',
    secretAccessKey: form.secretAccessKey || '',
    pathStyle: Boolean(form.pathStyle),
    useSSL: form.useSSL !== false,
    downloadExpireSeconds:
      form.downloadExpireSeconds && form.downloadExpireSeconds > 0
        ? Number(form.downloadExpireSeconds)
        : 3600,
  }
  return {
    version: 2,
    profiles: [profile],
  }
}

const loadConfig = async () => {
  if (!currentNodeId.value) {
    return
  }
  loading.value = true
  try {
    const resp = await fetch(`/api/forward/${currentNodeId.value}/schedule/s3`)
    const result = await resp.json()
    if (!resp.ok) {
      const msg = result && result.message ? result.message : `HTTP ${resp.status}`
      throw new Error(msg)
    }
    if (!result || !result.success) {
      const msg = result && result.message ? result.message : '获取 S3 配置失败'
      throw new Error(msg)
    }
    const config = result.data || {}
    applyConfigToForm(config)
    ElMessage.success('S3 配置已加载')
  } catch (e) {
    ElMessage.error(e.message || '获取 S3 配置失败')
  } finally {
    loading.value = false
  }
}

const saveConfig = async () => {
  if (!currentNodeId.value) {
    ElMessage.warning('请先选择节点')
    return
  }
  const config = buildConfigFromForm()
  loading.value = true
  try {
    const resp = await fetch(`/api/forward/${currentNodeId.value}/schedule/s3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    })
    const result = await resp.json()
    if (!resp.ok) {
      const msg = result && result.message ? result.message : `HTTP ${resp.status}`
      throw new Error(msg)
    }
    if (!result || !result.success) {
      const msg = result && result.message ? result.message : '保存 S3 配置失败'
      throw new Error(msg)
    }
    ElMessage.success('S3 配置已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存 S3 配置失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.s3-setting-page {
  height: 100%;
  overflow-y: auto;
}

.page-content {
  max-width: 900px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.setting-form {
  margin-top: 10px;
}

.advanced-settings {
  padding: 10px 0;
}

.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.switch-label {
  color: var(--el-text-color-regular);
}

.mb-4 {
  margin-bottom: 16px;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
</style>
