<template>
  <el-dialog
    v-model="visibleModel"
    title="证书设置"
    width="400px"
    destroy-on-close
    @close="handleClose"
  >
    <div class="cert-banner">
      <div class="banner-icon">
        <el-icon><Medal /></el-icon>
      </div>
      <div class="banner-content">
        <span class="banner-label">当前证书</span>
        <span class="banner-value">{{ certName }}</span>
      </div>
    </div>

    <div v-loading="loading">
      <el-form
        ref="formRef"
        :model="form"
        label-width="80px"
        label-position="top"
        v-loading="actionLoading"
      >
        <!-- 基础设置 -->
        <div class="section-card">
          <div class="section-header">
            <h3 class="section-title"><el-icon><Setting /></el-icon> 基础设置</h3>
            <el-button link type="primary" :icon="Refresh" @click="loadCertInfo" :disabled="actionLoading">
              刷新
            </el-button>
          </div>

          <el-form-item label="备注" prop="remark">
            <el-input v-model="form.remark" placeholder="备注信息，可选" />
          </el-form-item>

          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-label">开启自动续签</span>
              <span v-if="!autoRenewSupported" class="muted-text">来源为 other 的证书不支持自动续签</span>
            </div>
            <el-switch
              v-model="form.autoRenew"
              :disabled="!autoRenewSupported"
            />
          </div>

          <div class="action-footer">
            <el-button type="primary" @click="saveSettings" :loading="actionLoading">保存设置</el-button>
          </div>
        </div>

        <!-- 手动续签 -->
        <div class="section-card mt-20">
          <div class="section-header">
            <h3 class="section-title"><el-icon><RefreshRight /></el-icon> 手动续签</h3>
          </div>

          <el-alert
            title="提示"
            type="warning"
            description="续签会用同名证书覆盖现有证书，任务提交后请前往任务中心查看进度。"
            show-icon
            :closable="false"
            class="mb-16"
          />

          <div v-if="renewConfirmVisible" class="confirm-box">
            <div class="confirm-text">
              <el-icon class="warning-icon"><Warning /></el-icon>
              <span>确认续签证书：{{ certName }}</span>
            </div>
            <div class="confirm-buttons">
              <el-button
                type="warning"
                @click="confirmRenew"
                :disabled="renewCountdown > 0"
                :loading="actionLoading"
              >
                确认续签 {{ renewCountdown > 0 ? `(${renewCountdown}s)` : '' }}
              </el-button>
              <el-button @click="cancelRenewConfirm" :disabled="actionLoading">取消</el-button>
            </div>
          </div>

          <div v-else class="action-footer">
            <el-button type="warning" plain @click="showRenewConfirm" :disabled="actionLoading">手动续签</el-button>
          </div>
        </div>
      </el-form>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Medal, Setting, Refresh,
  RefreshRight, Warning
} from '@element-plus/icons-vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
  certName: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'close', 'success'])

const visibleModel = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const loading = ref(false)
const actionLoading = ref(false)
const certItem = ref(null)
const meta = ref(null)

const form = ref({
  remark: '',
  autoRenew: false
})

const renewConfirmVisible = ref(false)
const renewCountdown = ref(0)
let renewCountdownTimer = null

const autoRenewSupported = computed(() => {
  const src = certItem.value?.source ? String(certItem.value.source) : ''
  return src !== 'other'
})

const email = computed(() => {
  return certItem.value?.email || meta.value?.email || ''
})

const domains = computed(() => {
  if (certItem.value?.domains?.length) {
    return certItem.value.domains.map(v => String(v || '').trim()).filter(Boolean)
  }
  const csv = meta.value?.domains_csv || ''
  if (!csv) return []
  return csv.split(',').map(s => s.trim()).filter(Boolean)
})

const resetState = () => {
  loading.value = false
  actionLoading.value = false
  certItem.value = null
  meta.value = null
  form.value = {
    remark: '',
    autoRenew: false
  }
  cancelRenewConfirm()
}

const handleClose = () => {
  if (loading.value || actionLoading.value) return
  emit('update:visible', false)
  emit('close')
}

const loadCertInfo = async () => {
  if (!props.nodeId || !props.certName) return

  try {
    loading.value = true

    // 加载列表获取基础信息
    const listResp = await fetch(`/api/forward/${props.nodeId}/website/ssl/certs`)
    const listData = await listResp.json()
    if (listData.success) {
      const list = listData.data?.certs || []
      certItem.value = list.find(it => it.name === props.certName) || null
    }

    // 加载元数据
    const metaResp = await fetch(`/api/forward/${props.nodeId}/website/ssl/certs/${encodeURIComponent(props.certName)}/meta`)
    const metaData = await metaResp.json()
    if (metaData.success) {
      meta.value = metaData.data || null
      form.value.remark = (meta.value?.remark ?? certItem.value?.remark ?? '').trim()
      if (typeof meta.value?.auto_renew === 'boolean') {
        form.value.autoRenew = meta.value.auto_renew
      }
    }
  } catch (e) {
    ElMessage.error(e.message || '加载证书信息失败')
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  try {
    actionLoading.value = true
    const body = { remark: form.value.remark }
    if (autoRenewSupported.value) {
      body.autoRenew = form.value.autoRenew
    }

    const resp = await fetch(`/api/forward/${props.nodeId}/website/ssl/certs/${encodeURIComponent(props.certName)}/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json()
    if (data.success) {
      ElMessage.success('保存成功')
      meta.value = data.data || meta.value
    } else {
      throw new Error(data.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

const showRenewConfirm = () => {
  renewConfirmVisible.value = true
  renewCountdown.value = 5
  if (renewCountdownTimer) clearInterval(renewCountdownTimer)
  renewCountdownTimer = setInterval(() => {
    renewCountdown.value--
    if (renewCountdown.value <= 0) {
      clearInterval(renewCountdownTimer)
      renewCountdownTimer = null
    }
  }, 1000)
}

const cancelRenewConfirm = () => {
  renewConfirmVisible.value = false
  renewCountdown.value = 0
  if (renewCountdownTimer) {
    clearInterval(renewCountdownTimer)
    renewCountdownTimer = null
  }
}

const confirmRenew = async () => {
  try {
    actionLoading.value = true
    if (!domains.value.length || !email.value) {
      await loadCertInfo()
    }

    if (!domains.value.length) throw new Error('域名列表为空，无法续签')
    if (!email.value) throw new Error('邮箱为空，无法续签')

    const resp = await fetch(`/api/forward/${props.nodeId}/website/ssl/issue-initial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certName: props.certName,
        domains: domains.value,
        email: email.value,
        remark: form.value.remark,
        autoRenew: autoRenewSupported.value ? form.value.autoRenew : false,
      }),
    })

    const data = await resp.json()
    if (data.success) {
      const taskId = data.data?.taskId ? String(data.data.taskId) : ''
      ElMessage.success(`续签任务已提交${taskId ? `（${taskId}）` : ''}，请前往任务中心查看进度`)
      cancelRenewConfirm()
    } else {
      throw new Error(data.message || '续签任务提交失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    actionLoading.value = false
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    resetState()
    loadCertInfo()
  }
})

onBeforeUnmount(() => {
  if (renewCountdownTimer) clearInterval(renewCountdownTimer)
})
</script>

<style scoped>


.cert-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 24px;
}

.banner-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.banner-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.banner-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.banner-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.section-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}

.section-title .el-icon {
  color: var(--el-color-primary);
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 20px 0;
  padding: 12px 16px;
  background: var(--el-fill-color-blank);
  border-radius: 8px;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-label {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.muted-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.action-footer {
  display: flex;
  justify-content: flex-end;
}

.confirm-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
  padding: 12px 16px;
  border-radius: 8px;
  gap: 12px;
}

.confirm-text {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-color-warning);
  font-size: 14px;
}

.warning-icon {
  font-size: 18px;
}

.confirm-buttons {
  display: flex;
  gap: 8px;
}

.mt-20 { margin-top: 20px; }
.mb-16 { margin-bottom: 16px; }

@media (max-width: 768px) {


  .confirm-box {
    flex-direction: column;
    align-items: stretch;
  }

  .confirm-buttons {
    justify-content: flex-end;
  }
}
</style>
