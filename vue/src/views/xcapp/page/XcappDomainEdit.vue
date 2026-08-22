<template>
  <div class="xcapp-domain-edit">
    <div class="page-header">
      <div class="header-left">
        <el-button text @click="$emit('cancel')">返回</el-button>
        <div class="header-title">{{ isEdit ? '编辑域名' : '添加域名' }}</div>
      </div>
      <div class="header-actions">
        <el-button @click="$emit('cancel')">取消</el-button>
        <el-button type="primary" @click="handleSave">保存配置</el-button>
      </div>
    </div>

    <div class="form-container">
      <el-card shadow="never" class="section-card">
        <template #header>基础配置</template>
        <el-form label-position="top">
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="域名 *">
                <el-input v-model="localForm.domain" placeholder="example.com" :disabled="isEdit" />
                <div class="form-hint">用户访问的域名</div>
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="源站 URL *（端口一般为空即可）">
                <div class="origin-row">
                  <el-select v-model="originProtocol" class="origin-select">
                    <el-option label="http://" value="http://" />
                    <el-option label="https://" value="https://" />
                  </el-select>
                  <el-input v-model="originAddress" placeholder="1.2.3.4 或 origin.com" @blur="validateOriginAddress" />
                  <el-input-number
                    v-model="originPort"
                    :min="1"
                    :max="65535"
                    :controls="false"
                    placeholder="端口"
                    @blur="validateOriginPort"
                  />
                </div>
                <div class="form-hint">回源地址，支持 IP 或域名</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="回源 Host">
                <el-input v-model="localForm.origin_host" placeholder="默认为空" />
                <div class="form-hint">自定义回源请求头中的 Host 字段</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="回源超时 (秒)">
                <el-input-number v-model.number="localForm.timeout" :min="1" :max="300" :controls="false" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>安全防护</template>
        <el-form label-position="top">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="防护预设方案">
                <el-select v-model="selectedPreset" @change="applyPreset">
                  <el-option label="严格防护" value="strict" />
                  <el-option label="中等防护（推荐）" value="moderate" />
                  <el-option label="宽松防护" value="loose" />
                  <el-option label="自定义配置" value="custom" />
                </el-select>
                <div class="form-hint">选择预设方案可快速配置防护参数</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="CC 域名阈值">
                <el-input-number
                  v-model.number="localForm.cc_domain_threshold"
                  :min="0"
                  :max="10000"
                  :controls="false"
                  @blur="validateCCDomainThreshold"
                  @input="onCustomInput"
                />
                <div class="form-hint">30秒内单一域名最大请求数，0为不限制</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="CC IP 阈值">
                <el-input-number
                  v-model.number="localForm.cc_ip_threshold"
                  :min="0"
                  :max="1000"
                  :controls="false"
                  @blur="validateCCIPThreshold"
                  @input="onCustomInput"
                />
                <div class="form-hint">30秒内单一 IP 最大请求数，0为不限制</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="IP 封顶限流">
                <el-input-number
                  v-model.number="localForm.rl_max_req"
                  :min="0"
                  :max="10000"
                  :controls="false"
                  @input="onCustomInput"
                />
                <div class="form-hint">超过此值直接封禁 IP (120秒内)</div>
              </el-form-item>
            </el-col>
          </el-row>
          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-label">CC 交互验证</div>
              <div class="toggle-desc">默认JS无感验证，开启此选项后，将启用计算题交互验证</div>
            </div>
            <el-switch v-model="localForm.cc_allow_interactive" />
          </div>
        </el-form>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>HTTPS 配置</template>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-label">启用 HTTPS</div>
            <div class="toggle-desc">开启 HTTPS 监听 (443端口)</div>
          </div>
          <el-switch v-model="localForm.https_enabled" />
        </div>
        <div v-if="localForm.https_enabled" class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-label">强制 HTTPS 跳转</div>
            <div class="toggle-desc">将 HTTP 请求重定向到 HTTPS</div>
          </div>
          <el-switch v-model="localForm.redirect_http_to_https" />
        </div>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>缓存配置</template>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-label">启用缓存</div>
            <div class="toggle-desc">适用于静态资源加速，动态内容请勿开启</div>
          </div>
          <el-switch v-model="cacheEnabled" />
        </div>
        <div v-if="cacheEnabled" class="cache-details">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="缓存有效期 (秒)">
                <el-input-number
                  v-model.number="localForm.cache_ttl"
                  :min="0"
                  :max="259200"
                  :controls="false"
                  @blur="validateCacheTTL"
                />
                <div class="form-hint">最长可设置 259200 秒（72小时）</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="最大缓存文件大小 (MB)">
                <el-input-number
                  v-model.number="localForm.max_cache_size"
                  :min="1"
                  :max="100"
                  :controls="false"
                  @blur="validateMaxCacheSize"
                />
                <div class="form-hint">限制单文件最大体积，允许范围 1-100MB，留空或错误值将回归默认(5MB)</div>
              </el-form-item>
            </el-col>
          </el-row>
          <el-alert
            type="warning"
            show-icon
            :closable="false"
            title="默认全缓存"
            description="动态交互站点（例如 WordPress）请勿开启。程序会自动拒绝缓存常见动态文件后缀（如 .php、.asp、.jsp 等），但请根据实际情况谨慎设置。"
            class="warning-alert"
          />
        </div>
      </el-card>
    </div>
  </div>
</template>

<script>
import { ElMessage } from 'element-plus'

export default {
  name: 'XcappDomainEdit',
  props: {
    initialData: { type: Object, default: () => ({}) },
    isEdit: { type: Boolean, default: false }
  },
  emits: ['save', 'cancel'],
  data() {
    return {
      cacheEnabled: false,
      originProtocol: 'http://',
      originAddress: '',
      originPort: null,
      originAddressError: '',
      originPortError: '',
      timeoutError: '',
      cacheTTLrror: '',
      maxCacheSizeError: '',
      ccDomainError: '',
      ccIPError: '',
      rlMaxError: '',
      selectedPreset: 'moderate',
      localForm: {
        domain: '',
        origin: '',
        origin_host: '',
        timeout: 60,
        cache_ttl: 0,
        max_cache_size: 5,
        cc_domain_threshold: 0,
        cc_ip_threshold: 0,
        cc_allow_interactive: false,
        rl_max_req: 0,
        https_enabled: false,
        redirect_http_to_https: false
      },
      presets: {
        strict: {
          cc_domain_threshold: 50,
          cc_ip_threshold: 10,
          cc_allow_interactive: true,
          rl_max_req: 50
        },
        moderate: {
          cc_domain_threshold: 100,
          cc_ip_threshold: 20,
          cc_allow_interactive: false,
          rl_max_req: 100
        },
        loose: {
          cc_domain_threshold: 300,
          cc_ip_threshold: 60,
          cc_allow_interactive: false,
          rl_max_req: 300
        }
      }
    }
  },
  watch: {
    initialData: {
      immediate: true,
      deep: true,
      handler(val) {
        if (val && Object.keys(val).length > 0) {
          this.localForm = JSON.parse(JSON.stringify(val))
          this.cacheEnabled = this.localForm.cache_ttl > 0

          // Convert max_cache_size from bytes to MB for display
          if (this.localForm.max_cache_size) {
            this.localForm.max_cache_size = Math.floor(this.localForm.max_cache_size / (1024 * 1024))
          } else {
             this.localForm.max_cache_size = 5 // default
          }

          this.parseOriginUrl(val.origin)
          this.selectedPreset = 'custom'
        } else {
          // Reset for new entry
          this.localForm = {
            domain: '',
            origin: '',
            origin_host: '',
            timeout: 60,
            cache_ttl: 0,
            max_cache_size: 5,
            cc_domain_threshold: 100,
            cc_ip_threshold: 20,
            cc_allow_interactive: false,
            rl_max_req: 100,
            https_enabled: false,
            redirect_http_to_https: false
          }
          this.cacheEnabled = false
          this.originProtocol = 'http://'
          this.originAddress = ''
          this.originPort = ''
          this.selectedPreset = 'moderate'
          this.clearAllErrors()
        }
      }
    },
    originProtocol() {
      this.updateOriginUrl()
    },
    originAddress() {
      this.updateOriginUrl()
    },
    originPort() {
      this.updateOriginUrl()
    },
    cacheEnabled(val) {
      if (!val) {
        this.localForm.cache_ttl = 0
      } else if (this.localForm.cache_ttl === 0) {
        this.localForm.cache_ttl = 3600 // Default to 1 hour if enabled
      }
    },
    'localForm.https_enabled'(val) {
      if (!val) {
        this.localForm.redirect_http_to_https = false
      }
    }
  },
  methods: {
    applyPreset() {
      const preset = this.presets[this.selectedPreset]
      if (preset) {
        this.localForm.cc_domain_threshold = preset.cc_domain_threshold
        this.localForm.cc_ip_threshold = preset.cc_ip_threshold
        this.localForm.cc_allow_interactive = preset.cc_allow_interactive
        this.localForm.rl_max_req = preset.rl_max_req
      }
    },

    onCustomInput() {
      this.selectedPreset = 'custom'
    },

    clearAllErrors() {
      this.originAddressError = ''
      this.originPortError = ''
      this.timeoutError = ''
      this.cacheTTLrror = ''
      this.maxCacheSizeError = ''
      this.ccDomainError = ''
      this.ccIPError = ''
      this.rlMaxError = ''
    },

    validateTimeout() {
      this.timeoutError = ''
      const value = this.localForm.timeout

      if (value === '' || value === null || value === undefined) {
        this.timeoutError = '回源超时不能为空'
        return false
      }

      const num = Number(value)
      if (isNaN(num) || !Number.isInteger(num)) {
        this.timeoutError = '请输入有效的整数'
        return false
      }

      if (num < 1 || num > 300) {
        this.timeoutError = '回源超时必须在 1-300 秒之间'
        return false
      }

      return true
    },

    validateCacheTTL() {
      this.cacheTTLrror = ''
      const value = this.localForm.cache_ttl

      if (value === '' || value === null || value === undefined) {
        this.cacheTTLrror = '缓存有效期不能为空'
        return false
      }

      const num = Number(value)
      if (isNaN(num) || !Number.isInteger(num)) {
        this.cacheTTLrror = '请输入有效的整数'
        return false
      }

      if (num < 0 || num > 259200) {
        this.cacheTTLrror = '缓存有效期必须在 0-259200 秒之间（0表示不缓存，最大72小时）'
        return false
      }

      return true
    },

    validateMaxCacheSize() {
      this.maxCacheSizeError = ''
      const value = this.localForm.max_cache_size

      // Allow empty/0/invalid, will use default 5
      if (value === '' || value === null || value === undefined) {
        this.localForm.max_cache_size = 5
        return true
      }

      const num = Number(value)
      if (isNaN(num) || !Number.isInteger(num) || num <= 0 || num < 1 || num > 100) {
        this.localForm.max_cache_size = 5
        return true
      }

      return true
    },

    validateCCDomainThreshold() {
      this.ccDomainError = ''
      const value = this.localForm.cc_domain_threshold

      if (value === '' || value === null || value === undefined) {
        this.ccDomainError = 'CC 域名阈值不能为空'
        return false
      }

      const num = Number(value)
      if (isNaN(num) || !Number.isInteger(num)) {
        this.ccDomainError = '请输入有效的整数'
        return false
      }

      if (num < 0 || num > 10000) {
        this.ccDomainError = 'CC 域名阈值必须在 0-10000 之间（0表示不限制）'
        return false
      }

      return true
    },

    validateCCIPThreshold() {
      this.ccIPError = ''
      const value = this.localForm.cc_ip_threshold

      if (value === '' || value === null || value === undefined) {
        this.ccIPError = 'CC IP 阈值不能为空'
        return false
      }

      const num = Number(value)
      if (isNaN(num) || !Number.isInteger(num)) {
        this.ccIPError = '请输入有效的整数'
        return false
      }

      if (num < 0 || num > 1000) {
        this.ccIPError = 'CC IP 阈值必须在 0-1000 之间（0表示不限制）'
        return false
      }

      return true
    },

    validateRLMax() {
      this.rlMaxError = ''
      const value = this.localForm.rl_max_req

      if (value === '' || value === null || value === undefined) {
        this.rlMaxError = 'IP 封顶限流不能为空'
        return false
      }

      const num = Number(value)
      if (isNaN(num) || !Number.isInteger(num)) {
        this.rlMaxError = '请输入有效的整数'
        return false
      }

      if (num < 0 || num > 10000) {
        this.rlMaxError = 'IP 封顶限流必须在 0-10000 之间（0表示不限制）'
        return false
      }

      return true
    },

    parseOriginUrl(url) {
      if (!url) {
        this.originProtocol = 'http://'
        this.originAddress = ''
        this.originPort = null
        return
      }

      try {
        const urlObj = new URL(url)
        this.originProtocol = urlObj.protocol + '//'
        this.originAddress = urlObj.hostname
          this.originPort = urlObj.port ? Number(urlObj.port) : null
      } catch {
        const httpMatch = url.match(new RegExp('^(https?://)([^:/]+)(?::(\\d+))?'))
        if (httpMatch) {
          this.originProtocol = httpMatch[1]
          this.originAddress = httpMatch[2]
          this.originPort = httpMatch[3] ? Number(httpMatch[3]) : null
        } else {
          this.originProtocol = 'http://'
          this.originAddress = url
          this.originPort = ''
        }
      }
    },

    updateOriginUrl() {
      if (!this.originAddress) {
        this.localForm.origin = ''
        return
      }

      let url = this.originProtocol + this.originAddress
      if (this.originPort) {
        url += ':' + this.originPort
      }
      this.localForm.origin = url
    },

    validateOriginAddress() {
      this.originAddressError = ''

      if (!this.originAddress) {
        this.originAddressError = '地址不能为空'
        return false
      }

      const ipRegex = new RegExp('^(\\d{1,3}\\.){3}\\d{1,3}$')
      const domainRegex = new RegExp('^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$')

      if (ipRegex.test(this.originAddress)) {
        const parts = this.originAddress.split('.')
        for (const part of parts) {
          const num = parseInt(part, 10)
          if (num < 0 || num > 255) {
            this.originAddressError = 'IP 地址格式不正确'
            return false
          }
        }
      } else if (!domainRegex.test(this.originAddress)) {
        this.originAddressError = '域名格式不正确'
        return false
      }

      return true
    },

    validateOriginPort() {
      this.originPortError = ''

      if (!this.originPort) {
        return true
      }

      const port = parseInt(this.originPort, 10)
      if (isNaN(port) || port < 1 || port > 65535) {
        this.originPortError = '端口号必须在 1-65535 之间'
        return false
      }

      return true
    },

    handleSave() {
      if (!this.localForm.domain) {
        ElMessage.error('域名不能为空')
        return
      }

      if (!this.originAddress) {
        ElMessage.error('源站地址不能为空')
        return
      }

      if (!this.validateOriginAddress()) {
        ElMessage.error(this.originAddressError)
        return
      }

      if (!this.validateOriginPort()) {
        ElMessage.error(this.originPortError)
        return
      }

      if (!this.validateTimeout()) {
        ElMessage.error(this.timeoutError)
        return
      }

      if (this.cacheEnabled) {
        if (!this.validateCacheTTL()) {
          ElMessage.error(this.cacheTTLrror)
          return
        }
        if (!this.validateMaxCacheSize()) {
          ElMessage.error(this.maxCacheSizeError)
          return
        }
      }

      if (!this.validateCCDomainThreshold()) {
        ElMessage.error(this.ccDomainError)
        return
      }

      if (!this.validateCCIPThreshold()) {
        ElMessage.error(this.ccIPError)
        return
      }

      if (!this.validateRLMax()) {
        ElMessage.error(this.rlMaxError)
        return
      }

      const d = { ...this.localForm }
      d.timeout = parseInt(d.timeout) || 60
      d.cache_ttl = parseInt(d.cache_ttl) || 0

      // Convert UI MB to Bytes
      let maxSizeMB = parseInt(d.max_cache_size)
      if (isNaN(maxSizeMB) || maxSizeMB <= 0) maxSizeMB = 5
      d.max_cache_size = maxSizeMB * 1024 * 1024
      delete d.cleanup_interval

      d.cc_domain_threshold = parseInt(d.cc_domain_threshold) || 0
      d.cc_ip_threshold = parseInt(d.cc_ip_threshold) || 0
      d.rl_max_req = parseInt(d.rl_max_req) || 0

      this.$emit('save', d)
    }
  }
}
</script>

<style scoped>
.xcapp-domain-edit {
  padding: 10px 20px;
  color: var(--el-text-color-primary);
  max-width: 980px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-actions {
  display: flex;
  gap: 10px;
}

.form-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-card {
  border-radius: var(--el-border-radius-base);
}

.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}

.origin-row {
  display: grid;
  grid-template-columns: 140px 1fr 140px;
  gap: 8px;
}

.origin-select {
  width: 100%;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-label {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.toggle-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cache-details {
  margin-top: 12px;
}

.warning-alert {
  margin-top: 10px;
  border-radius: var(--el-border-radius-base);
}

:deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-card__body) {
  padding: 16px;
}

:deep(.el-form-item__label) {
  color: var(--el-text-color-secondary);
}

@media (max-width: 900px) {
  .origin-row {
    grid-template-columns: 1fr;
  }
}
</style>
