<template>
  <div class="account-setting-page">
    <div class="page-content">
      <!-- 账户信息区域 -->
      <el-card class="box-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <h3>账户信息</h3>
          </div>
        </template>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">用户名</span>
            <span class="setting-desc">修改当前账户的登录用户名</span>
          </div>
          <div class="setting-action">
            <el-input
              v-model="username"
              placeholder="请输入新用户名"
              :disabled="usernameLoading"
              style="width: 200px; margin-right: 10px"
              @input="handleUsernameInput"
            />
            <el-button
              type="primary"
              @click="saveUsername"
              :loading="usernameLoading"
              :disabled="!filterUsername(username)"
            >
              保存
            </el-button>
          </div>
        </div>

        <el-divider />

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">密码</span>
            <span class="setting-desc">修改当前账户的登录密码</span>
          </div>
          <div class="setting-action">
            <el-input
              v-model="password"
              type="password"
              show-password
              placeholder="请输入新密码"
              :disabled="passwordLoading"
              style="width: 200px; margin-right: 10px"
              @input="handlePasswordInput"
              autocomplete="new-password"
            />
            <el-button
              type="primary"
              @click="savePassword"
              :loading="passwordLoading"
              :disabled="!filterPassword(password)"
            >
              保存
            </el-button>
          </div>
        </div>

        <el-divider />

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">两步验证 (MFA)</span>
            <span class="setting-desc">
              {{ mfaEnabled ? '两步验证已启用，账户更安全' : '未启用两步验证' }}
            </span>
          </div>
          <div class="setting-action">
            <el-button
              type="success"
              @click="setupMFA"
              :loading="mfaLoading"
              :disabled="mfaEnabled"
            >
              开启 MFA
            </el-button>
            <el-button
              type="danger"
              @click="handleCloseMFA"
              :loading="mfaLoading"
              :disabled="!mfaEnabled"
              style="margin-left: 10px"
            >
              关闭 MFA
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- MFA设置弹窗 -->
    <MfaSetupModal
      v-model="showMfaSetupModal"
      @success="onMfaSetupSuccess"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MfaSetupModal from '../components/MfaSetupModal.vue'

// MFA状态
const mfaEnabled = ref(false)
const mfaLoading = ref(false)
const showMfaSetupModal = ref(false)

// 账户信息设置
const username = ref('')
const password = ref('')
const usernameLoading = ref(false)
const passwordLoading = ref(false)

// 输入体验优化：根据后端规则过滤字符
const filterUsername = (s) => s.replace(/[^a-zA-Z0-9,.]/g, '')
const filterPassword = (s) => s.replace(/[^a-zA-Z0-9,.]/g, '')

const handleUsernameInput = (value) => {
  username.value = filterUsername(value)
}

const handlePasswordInput = (value) => {
  password.value = filterPassword(value)
}

// 获取当前设置状态
const fetchSettings = async () => {
  try {
    const response = await fetch('/api/set/status', {
      method: 'GET',
      credentials: 'same-origin',
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        mfaEnabled.value = result.mfaEnabled
      } else {
        ElMessage({
          message: result.message || '无法获取设置信息',
          type: 'error',
          duration: 4000,
        })
      }
    } else if (response.status === 401) {
      ElMessage({
        message: 'token验证失败或已过期，请重新登录',
        type: 'error',
        duration: 4000,
      })
    } else {
      ElMessage({
        message: '获取设置失败，请稍后重试',
        type: 'error',
        duration: 4000,
      })
    }
  } catch (error) {
    console.error('获取设置失败:', error)
  }
}

// 处理关闭MFA
const handleCloseMFA = () => {
  ElMessageBox.confirm(
    '确定要关闭两步验证吗？这将降低您的账户安全性。',
    '关闭两步验证',
    {
      confirmButtonText: '确定关闭',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(async () => {
      await turnOffMFA()
    })
    .catch(() => {
    })
}

// 关闭MFA
const turnOffMFA = async () => {
  mfaLoading.value = true
  try {
    const response = await fetch('/api/set/offmfa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        mfaEnabled.value = false
        ElMessage({
          message: result.message || '身份验证器已关闭',
          type: 'success',
          duration: 3000,
        })
        return true
      } else {
        ElMessage({
          message: '关闭MFA失败: ' + (result.message || '未知错误'),
          type: 'error',
          duration: 4000,
        })
        return false
      }
    } else {
      ElMessage({
        message: '请求失败，请稍后重试',
        type: 'error',
        duration: 4000,
      })
      return false
    }
  } catch (error) {
    console.error('关闭MFA失败:', error)
    ElMessage({
      message: '关闭MFA失败，请稍后重试',
      type: 'error',
      duration: 4000,
    })
    return false
  } finally {
    mfaLoading.value = false
  }
}

// 保存用户名
const saveUsername = async () => {
  const cleanUsername = filterUsername(username.value)
  if (!cleanUsername) return

  usernameLoading.value = true
  try {
    const response = await fetch('/api/set/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'username',
        newValue: cleanUsername,
      }),
      credentials: 'same-origin',
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        ElMessage({
          message: '用户名更新成功',
          type: 'success',
          duration: 3000,
        })
        username.value = ''
      } else {
        ElMessage({
          message: '用户名更新失败: ' + (result.message || '未知错误'),
          type: 'error',
          duration: 4000,
        })
      }
    } else {
      ElMessage({
        message: '请求失败，请稍后重试',
        type: 'error',
        duration: 4000,
      })
    }
  } catch (error) {
    console.error('更新用户名失败:', error)
    ElMessage({
      message: '更新用户名失败，请稍后重试',
      type: 'error',
      duration: 4000,
    })
  } finally {
    usernameLoading.value = false
  }
}

// 保存密码
const savePassword = async () => {
  const cleanPassword = filterPassword(password.value)
  if (!cleanPassword) return

  passwordLoading.value = true
  try {
    const response = await fetch('/api/set/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'password',
        newValue: cleanPassword,
      }),
      credentials: 'same-origin',
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        ElMessage({
          message: '密码更新成功',
          type: 'success',
          duration: 3000,
        })
        password.value = ''
      } else {
        ElMessage({
          message: '密码更新失败: ' + (result.message || '未知错误'),
          type: 'error',
          duration: 4000,
        })
      }
    } else {
      ElMessage({
        message: '请求失败，请稍后重试',
        type: 'error',
        duration: 4000,
      })
    }
  } catch (error) {
    console.error('更新密码失败:', error)
    ElMessage({
      message: '更新密码失败，请稍后重试',
      type: 'error',
      duration: 4000,
    })
  } finally {
    passwordLoading.value = false
  }
}

// 设置MFA
const setupMFA = () => {
  if (!mfaEnabled.value) {
    showMfaSetupModal.value = true
  }
}

// MFA设置成功回调
const onMfaSetupSuccess = () => {
  mfaEnabled.value = true
  showMfaSetupModal.value = false
  // 重新获取设置状态
  fetchSettings()

  // 显示设置成功通知
  ElMessage({
    message: '身份验证器密钥设置成功',
    type: 'success',
    duration: 3000,
  })
}

// 组件挂载时获取设置
onMounted(() => {
  fetchSettings()
})
</script>

<style scoped>
.account-setting-page {
  height: 100%;
  overflow-y: auto;
}

.page-content {
  max-width: 800px;
  margin: 0 auto;
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.setting-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.setting-action {
  display: flex;
  align-items: center;
}
</style>
