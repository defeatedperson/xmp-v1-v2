<template>
  <div class="settings-content">
    <el-row :gutter="10">
      <!-- 官方商店更新 -->
      <el-col :xs="24" :md="12">
        <el-card class="settings-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="title">更新官方商店</span>
              <p class="subtitle">从官方源获取最新的应用商店数据</p>
            </div>
          </template>

          <div class="card-body">
            <div class="url-info">
              <span class="label">官方源：</span>
              <span class="url-text">https://dl.xmpanel.cn</span>
            </div>

            <el-button
              type="primary"
              class="action-btn"
              :loading="loading.official"
              @click="updateOfficialStore"
            >
              <el-icon class="mr-2"><Download /></el-icon>
              {{ loading.official ? '更新中...' : '更新官方商店' }}
            </el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 自定义商店设置 -->
      <el-col :xs="24" :md="12">
        <el-card class="settings-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="title">设置自定义商店</span>
              <p class="subtitle">配置自定义应用商店数据源</p>
            </div>
          </template>

          <div class="card-body">
            <div class="input-tabs-container">
              <el-radio-group v-model="inputMode" size="default">
                <el-radio-button label="url">URL 输入</el-radio-button>
                <el-radio-button label="json">JSON 粘贴</el-radio-button>
              </el-radio-group>
            </div>

            <div class="input-section">
              <div v-if="inputMode === 'url'" class="url-input-container">
                <el-input
                  v-model="customUrl"
                  placeholder="请输入自定义商店的 URL 地址"
                  class="url-input"
                  clearable
                >
                  <template #append>
                    <el-button
                      :loading="loading.fetchUrl"
                      @click="fetchCustomFromUrl"
                    >
                      <el-icon class="mr-1"><Download /></el-icon>
                      获取
                    </el-button>
                  </template>
                </el-input>
              </div>

              <div v-else class="json-input-container">
                <el-input
                  v-model="customJson"
                  type="textarea"
                  :rows="8"
                  placeholder='请粘贴 JSON 数据，例如：{"types": [...], "apps": [...]}'
                  class="json-input"
                />
              </div>
            </div>

            <el-button
              type="success"
              class="action-btn save-btn"
              :loading="loading.custom"
              @click="saveCustomStore"
            >
              <el-icon class="mr-2"><CircleCheck /></el-icon>
              {{ loading.custom ? '保存中...' : '保存自定义商店' }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, CircleCheck } from '@element-plus/icons-vue'

const inputMode = ref('url')
const customUrl = ref('')
const customJson = ref('')

const loading = ref({
  official: false,
  fetchUrl: false,
  custom: false
})

const updateOfficialStore = async () => {
  loading.value.official = true
  try {
    const response = await fetch('https://dl.xmpanel.cn')
    if (!response.ok) {
      throw new Error('获取官方商店数据失败')
    }
    const data = await response.json()

    const updateResponse = await fetch('/api/appstore/docker-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    })
    const updateResult = await updateResponse.json()

    if (updateResult.success) {
      ElMessage.success('官方商店更新成功')
    } else {
      throw new Error(updateResult.message || '更新失败')
    }
  } catch (error) {
    ElMessage.error(error.message || '更新官方商店失败')
  } finally {
    loading.value.official = false
  }
}

const fetchCustomFromUrl = async () => {
  if (!customUrl.value.trim()) {
    ElMessage.warning('请输入 URL 地址')
    return
  }

  loading.value.fetchUrl = true
  try {
    const response = await fetch(customUrl.value.trim())
    if (!response.ok) {
      throw new Error('获取自定义商店数据失败')
    }
    const data = await response.json()
    customJson.value = JSON.stringify(data, null, 2)
    ElMessage.success('获取成功，请确认后保存')
  } catch (error) {
    ElMessage.error(error.message || '获取数据失败，请检查 URL')
  } finally {
    loading.value.fetchUrl = false
  }
}

const saveCustomStore = async () => {
  let data

  if (inputMode.value === 'json') {
    if (!customJson.value.trim()) {
      ElMessage.warning('请输入 JSON 数据')
      return
    }
    try {
      data = JSON.parse(customJson.value)
    } catch {
      ElMessage.error('JSON 格式错误，请检查输入')
      return
    }
  } else {
    ElMessage.warning('请先获取或直接切换到 JSON 粘贴模式')
    return
  }

  loading.value.custom = true
  try {
    const response = await fetch('/api/appstore/custom-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success('自定义商店保存成功')
      customJson.value = ''
    } else {
      throw new Error(result.message || '保存失败')
    }
  } catch (error) {
    ElMessage.error(error.message || '保存自定义商店失败')
  } finally {
    loading.value.custom = false
  }
}
</script>

<style scoped>
.settings-content {
  padding: 0px;
}

.settings-card {
  height: 100%;
  border-radius: var(--el-border-radius-base);
  background-color: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-header .title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card-header .subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.url-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background-color: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
  font-size: 14px;
}

.url-info .label {
  color: var(--el-text-color-secondary);
}

.url-info .url-text {
  color: var(--el-color-primary);
  font-family: monospace;
  word-break: break-all;
}

.action-btn {
  width: 100%;
  height: 40px;
  font-weight: 600;
}

.input-tabs-container {
  margin-bottom: 4px;
}

.input-section {
  min-height: 100px;
}

.mr-1 {
  margin-right: 4px;
}

.mr-2 {
  margin-right: 8px;
}

:deep(.el-card__header) {
  padding: 20px 24px;
  border-bottom: 1px solid var(--el-border-color-light);
}

:deep(.el-card__body) {
  padding: 24px;
}

:deep(.el-input-group__append) {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
  border-color: var(--el-border-color-light);
}

:deep(.el-input__wrapper) {
  background-color: var(--el-fill-color-blank);
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
}

:deep(.el-textarea__inner) {
  background-color: var(--el-fill-color-blank);
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
  color: var(--el-text-color-primary);
}
</style>
