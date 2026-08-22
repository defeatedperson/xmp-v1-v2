<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElNotification } from 'element-plus'

// 定义响应式数据
const router = useRouter()
const username = ref('')
const password = ref('')
const robotCode = ref('')
const mfaCode = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const isRefreshing = ref(false)

// MFA输入框显示状态
const showMfaInput = ref(false)

// 验证码图片URL
const robotImageUrl = ref('/api/robot?' + Date.now())

// 刷新验证码
const refreshRobotImage = () => {
  isRefreshing.value = true
  robotImageUrl.value = '/api/robot?' + Date.now()
  setTimeout(() => {
    isRefreshing.value = false
  }, 500)
}

// 输入体验优化
const filterUsername = (s) => s.replace(/[^a-zA-Z0-9,.]/g, '')
const filterPassword = (s) => s.replace(/[^a-zA-Z0-9,.]/g, '')
const filterRobotCode = (s) => s.replace(/\D/g, '').slice(0, 7)
const filterMfaCode = (s) => s.replace(/\D/g, '').slice(0, 6)

const onUsernameInput = (val) => {
  username.value = filterUsername(val)
}
const onPasswordInput = (val) => {
  password.value = filterPassword(val)
}
const onRobotCodeInput = (val) => {
  robotCode.value = filterRobotCode(val)
}
const onMfaCodeInput = (val) => {
  mfaCode.value = filterMfaCode(val)
}

// 检查登录状态
const checkLoginStatus = async () => {
  try {
    const response = await fetch('/api/login')
    if (response.status === 403) {
      const data = await response.json()
      if (data.message === '您已登录，无需重复登录') {
        router.push('/dashboard')
        return
      }
    }
    const data = await response.json()
    if (data.success) {
      showMfaInput.value = data.requireMFA || false
    }
  } catch (error) {
    console.error('检查登录状态失败:', error)
  }
}

// 提交登录表单
const submitLogin = async () => {
  username.value = filterUsername(username.value)
  password.value = filterPassword(password.value)
  robotCode.value = filterRobotCode(robotCode.value)

  if (showMfaInput.value && (!mfaCode.value || mfaCode.value.length !== 6)) {
    errorMessage.value = '请输入6位数字验证码'
    return
  }

  if (!username.value || !password.value || !robotCode.value) {
    errorMessage.value = '请填写所有字段'
    return
  }

  if (robotCode.value.length !== 7) {
    errorMessage.value = '验证码必须为7位数字'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.value,
        password: password.value,
        captcha: robotCode.value,
        totpCode: showMfaInput.value ? mfaCode.value : undefined,
      }),
    })

    const data = await response.json()

    if (data.success) {
      ElNotification({
        title: '登录成功',
        message: '欢迎回来！',
        type: 'success',
        duration: 2000,
      })
      router.push('/dashboard')
    } else {
      errorMessage.value = data.message
      refreshRobotImage()
      robotCode.value = ''
      mfaCode.value = ''
    }
  } catch (error) {
    ElNotification({
      title: '网络错误',
      message: '网络连接失败，请检查网络后重试',
      type: 'error',
      duration: 4000,
    })
    console.error('登录请求失败:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  checkLoginStatus()
})
</script>

<template>
  <div class="login-container">
    <el-card class="login-card" :body-style="{ padding: '40px' }">
      <div class="login-header">
        <img src="/img/logo.png" alt="星梦面板" class="brand-logo" />
      </div>

      <el-form @submit.prevent="submitLogin" label-position="top">
        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
          class="mb-20"
        />

        <el-form-item label="用户名">
          <el-input
            v-model="username"
            placeholder="请输入用户名"
            @input="onUsernameInput"
            autocomplete="username"
            autofocus
          >
            <template #prefix>
              <i class="fas fa-user"></i>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="密码">
          <el-input
            v-model="password"
            type="password"
            placeholder="请输入密码"
            @input="onPasswordInput"
            autocomplete="current-password"
            show-password
          >
            <template #prefix>
              <i class="fas fa-lock"></i>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="验证码">
          <div class="robot-input-wrapper">
            <el-input
              v-model="robotCode"
              placeholder="请输入验证码"
              @input="onRobotCodeInput"
              maxlength="7"
            >
              <template #prefix>
                <i class="fas fa-shield-halved"></i>
              </template>
            </el-input>
            <div class="robot-image-container">
              <img
                :src="robotImageUrl"
                alt="验证码"
                @click="refreshRobotImage"
                class="robot-image"
              />
              <span
                class="refresh-icon"
                :class="{ 'spinning': isRefreshing }"
                @click="refreshRobotImage"
              >
                <i class="fas fa-sync-alt"></i>
              </span>
            </div>
          </div>
        </el-form-item>

        <el-form-item v-if="showMfaInput" label="二次验证">
          <el-input
            v-model="mfaCode"
            placeholder="请输入6位数字验证码"
            @input="onMfaCodeInput"
            maxlength="6"
            autocomplete="one-time-code"
          >
            <template #prefix>
              <i class="fas fa-key"></i>
            </template>
          </el-input>
        </el-form-item>

        <el-button
          type="primary"
          class="login-button"
          :loading="isLoading"
          @click="submitLogin"
        >
          {{ isLoading ? '登录中...' : '登录' }}
        </el-button>

        <p class="agreement-note">
          登录即代表您同意
          <el-link type="primary" href="https://xmpanel.cn/terms/usage" target="_blank" :underline="false">
            使用协议
          </el-link>
        </p>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: var(--el-bg-color-page);
  background-image:
    radial-gradient(circle at 50% -20%, var(--el-color-primary-light-8), transparent),
    radial-gradient(circle at 0% 100%, var(--el-color-primary-light-9), transparent);
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background-color: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  box-shadow: var(--el-box-shadow-dark);
  backdrop-filter: blur(10px);
  animation: fadeInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.brand-logo {
  height: 80px;
  width: auto;
  margin: 0 auto;
  display: block;
  filter: drop-shadow(0 0 12px var(--el-color-primary-light-5));
}

.mb-20 {
  margin-bottom: 20px;
}

.robot-input-wrapper {
  display: flex;
  gap: 12px;
  width: 100%;
}

.robot-image-container {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.robot-image {
  height: 32px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-small);
  cursor: pointer;
  transition: opacity 0.2s;
}

.robot-image:hover {
  opacity: 0.8;
}

.refresh-icon {
  position: absolute;
  right: -8px;
  top: -8px;
  background-color: var(--el-color-primary);
  color: #fff;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.3s ease;
  box-shadow: var(--el-box-shadow-light);
  z-index: 1;
}

.robot-image-container:hover .refresh-icon {
  opacity: 1;
}

.refresh-icon.spinning i {
  animation: spin 0.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.login-button {
  width: 100%;
  margin-top: 10px;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
}

.agreement-note {
  margin-top: 20px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

/* 装饰性背景效果 */
.login-container::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 80% 20%, var(--el-color-primary-light-9), transparent 40%),
    radial-gradient(circle at 20% 80%, var(--el-color-primary-light-9), transparent 40%);
  opacity: 0.5;
  pointer-events: none;
}

@media (max-width: 480px) {
  .login-card {
    border: none;
    background-color: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  .login-container {
    background-image: none;
    background-color: var(--el-bg-color);
  }
}
</style>
