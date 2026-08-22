<template>
  <el-dialog
    v-model="visible"
    title="设置两步验证 (MFA)"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @closed="handleClosed"
    append-to-body
  >
    <div class="mfa-setup-content">
      <el-steps :active="currentStep" finish-status="success" align-center class="mb-4">
        <el-step title="扫描二维码" />
        <el-step title="验证代码" />
        <el-step title="完成" />
      </el-steps>

      <!-- Step 1: Scan QR Code -->
      <div v-if="currentStep === 0" class="step-content">
        <div class="step-description">
          请使用身份验证器应用（如Google Authenticator）扫描下方二维码
        </div>

        <div class="qr-code-container" v-loading="loading">
          <canvas ref="qrCanvas" class="qr-code"></canvas>
        </div>

        <div class="manual-key" v-if="secret">
          <div class="manual-key-title">或手动输入密钥：</div>
          <div class="manual-key-value">
            {{ secret }}
            <el-button link type="primary" size="small" @click="copySecret">
              复制
            </el-button>
          </div>
        </div>

        <div class="step-actions">
          <el-button type="primary" @click="nextStep" :disabled="!secret">下一步</el-button>
        </div>
      </div>

      <!-- Step 2: Verify Code -->
      <div v-if="currentStep === 1" class="step-content">
        <div class="step-description">请输入身份验证器应用中显示的6位数字代码</div>

        <div class="input-group">
          <el-input
            v-model="verificationCode"
            placeholder="请输入6位数字代码"
            maxlength="6"
            size="large"
            @input="handleCodeInput"
            :disabled="verifying"
            class="code-input"
          >
            <template #prefix>
              <i class="fas fa-shield-alt"></i>
            </template>
          </el-input>
        </div>

        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <div class="step-actions">
          <el-button @click="prevStep" :disabled="verifying">上一步</el-button>
          <el-button
            type="primary"
            @click="verifyAndSetup"
            :loading="verifying"
            :disabled="!isCodeValid"
          >
            验证并启用
          </el-button>
        </div>
      </div>

      <!-- Step 3: Success -->
      <div v-if="currentStep === 2" class="step-content text-center">
        <div class="success-content">
          <i class="fas fa-check-circle success-icon" style="font-size: 60px; color: #67C23A;"></i>
          <h3 class="success-title">MFA设置成功！</h3>
          <p class="success-description">两步验证已成功启用，您的账户安全性得到了提升。</p>
          <el-button type="success" @click="closeModal">完成</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'success'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const currentStep = ref(0)
const loading = ref(false)
const verifying = ref(false)
const secret = ref('')
const verificationCode = ref('')
const errorMessage = ref('')
const qrCanvas = ref(null)

const isCodeValid = computed(() => {
  return /^\d{6}$/.test(verificationCode.value)
})

watch(
  () => visible.value,
  (newValue) => {
    if (newValue) {
      resetModal()
      generateSecret()
    }
  },
)

const resetModal = () => {
  currentStep.value = 0
  loading.value = false
  verifying.value = false
  secret.value = ''
  verificationCode.value = ''
  errorMessage.value = ''
}

const handleClosed = () => {
  resetModal()
}

const generateSecret = async () => {
  loading.value = true
  try {
    const response = await fetch('/api/set/getmfa', {
      method: 'GET',
      credentials: 'same-origin',
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        secret.value = result.data.secret
        await nextTick()
        await generateQRCode()
      } else {
        errorMessage.value = '获取密钥失败: ' + (result.message || '未知错误')
        ElMessage.error(errorMessage.value)
      }
    } else {
      errorMessage.value = '请求失败，请稍后重试'
      ElMessage.error(errorMessage.value)
    }
  } catch (error) {
    console.error('获取MFA密钥失败:', error)
    errorMessage.value = '获取密钥失败，请稍后重试'
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

const generateQRCode = async () => {
  if (!secret.value || !qrCanvas.value) return

  try {
    const issuer = '星梦面板'
    const accountName = '管理员'
    const otpAuthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret.value}&issuer=${encodeURIComponent(issuer)}`

    await QRCode.toCanvas(qrCanvas.value, otpAuthUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
  } catch (error) {
    console.error('生成二维码失败:', error)
    errorMessage.value = '生成二维码失败'
  }
}

const handleCodeInput = (value) => {
  verificationCode.value = value.replace(/\D/g, '')
  errorMessage.value = ''
}

const copySecret = async () => {
  try {
    await navigator.clipboard.writeText(secret.value)
    ElMessage.success('密钥已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

const nextStep = () => {
  if (secret.value) {
    currentStep.value = 1
  }
}

const prevStep = () => {
  currentStep.value = 0
  verificationCode.value = ''
  errorMessage.value = ''
  // Re-generate QR code when going back
  nextTick(() => {
    generateQRCode()
  })
}

const verifyAndSetup = async () => {
  if (!isCodeValid.value) return

  verifying.value = true
  errorMessage.value = ''

  try {
    const response = await fetch('/api/set/onmfa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: secret.value,
        code: verificationCode.value,
      }),
      credentials: 'same-origin',
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        currentStep.value = 2
        emit('success')
      } else {
        errorMessage.value = result.message || '验证失败，请重试'
        ElMessage.error(errorMessage.value)
      }
    } else {
      errorMessage.value = '请求失败，请稍后重试'
      ElMessage.error(errorMessage.value)
    }
  } catch (error) {
    console.error('验证MFA代码失败:', error)
    errorMessage.value = '验证失败，请稍后重试'
    ElMessage.error(errorMessage.value)
  } finally {
    verifying.value = false
  }
}

const closeModal = () => {
  visible.value = false
}
</script>

<style scoped>
.mfa-setup-content {
  padding: 10px 0;
}

.step-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
}

.step-description {
  text-align: center;
  color: var(--el-text-color-regular);
  margin-bottom: 20px;
}

.qr-code-container {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
  background: white;
  padding: 10px;
  border-radius: 8px;
}

.qr-code {
  border-radius: 4px;
}

.manual-key {
  background: var(--el-fill-color-dark);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 24px;
  width: 100%;
  text-align: center;
}

.manual-key-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.manual-key-value {
  font-family: monospace;
  font-size: 14px;
  color: var(--el-text-color-primary);
  word-break: break-all;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.input-group {
  width: 100%;
  max-width: 300px;
  margin-bottom: 16px;
}

.code-input :deep(.el-input__wrapper) {
  font-size: 18px;
  letter-spacing: 2px;
  text-align: center;
}

.error-message {
  color: var(--el-color-danger);
  font-size: 14px;
  margin-bottom: 16px;
}

.step-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  width: 100%;
  margin-top: 10px;
}

.success-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px 0;
}

.success-title {
  margin: 0;
  color: var(--el-text-color-primary);
}

.success-description {
  margin: 0;
  color: var(--el-text-color-regular);
  text-align: center;
}

.mb-4 {
  margin-bottom: 16px;
}
</style>
