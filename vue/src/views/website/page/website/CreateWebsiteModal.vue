<template>
  <el-dialog
    v-model="visibleModel"
    title="创建网站"
    width="400px"
    destroy-on-close
    :close-on-click-modal="false"
    class="create-website-dialog"
  >
    <el-alert
      title="一般只需要填写主域名即可，子域名和端口为可选配置"
      type="info"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="top"
      v-loading="loading"
    >
      <el-form-item label="主域名" prop="primaryDomain">
        <el-input
          v-model="form.primaryDomain"
          placeholder="例如: example.com"
          clearable
        />
      </el-form-item>

      <el-form-item label="站点类型" prop="type">
        <el-select v-model="form.type" placeholder="选择站点类型" class="w-full">
          <el-option label="静态站点" value="static" />
          <el-option label="反向代理" value="proxy" />
          <el-option label="PHP站点" value="php" />
        </el-select>
      </el-form-item>

      <!-- PHP 容器选择 -->
      <el-form-item
        v-if="form.type === 'php'"
        label="PHP 环境"
        prop="selectedPhpPort"
      >
        <el-select
          v-model="form.selectedPhpPort"
          :placeholder="phpLoading ? '正在加载 PHP 容器...' : '请选择运行中的 PHP 容器'"
          :loading="phpLoading"
          class="w-full"
        >
          <el-option
            v-for="env in phpContainers"
            :key="env.name"
            :label="`${env.name} (端口: ${env.publicPort})`"
            :value="env.publicPort"
          />
          <template #empty>
            <p class="p-2 text-center text-gray-500">
              {{ phpLoading ? '加载中...' : '未找到正在运行的 PHP 容器' }}
            </p>
          </template>
        </el-select>
      </el-form-item>

      <!-- 反向代理配置 -->
      <div v-if="form.type === 'proxy'" class="proxy-config-row">
        <el-form-item label="协议" prop="proxyProtocol" class="flex-1">
          <el-select v-model="form.proxyProtocol">
            <el-option label="HTTP" value="http" />
            <el-option label="HTTPS" value="https" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标地址" prop="proxyHost" class="flex-[2]">
          <el-input v-model="form.proxyHost" placeholder="例如: 127.0.0.1" />
        </el-form-item>
        <el-form-item label="端口" prop="proxyPort" class="flex-1">
          <el-input
            v-model="form.proxyPort"
            placeholder="80"
            @input="form.proxyPortAuto = false"
          />
        </el-form-item>
      </div>

      <el-divider content-position="left">
        <el-switch v-model="showAdvanced" active-text="高级设置" />
      </el-divider>

      <template v-if="showAdvanced">
        <el-form-item label="子域名" prop="subDomains">
          <el-input
            v-model="form.subDomains"
            type="textarea"
            :rows="2"
            placeholder="例如: www.example.com,m.example.com (多个用逗号分隔)"
          />
        </el-form-item>

        <div class="flex gap-4">
          <el-form-item label="监听端口" prop="port" class="flex-1">
            <el-input v-model.number="form.port" placeholder="默认 80" />
          </el-form-item>
          <el-form-item label="备注" prop="remark" class="flex-[2]">
            <el-input v-model="form.remark" placeholder="备注信息" />
          </el-form-item>
        </div>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="visibleModel = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">
        立即创建
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { parseDomainList, toAsciiDomain, toAsciiDomainList } from '@/utils/domain'
import { fetchPhpContainers } from '@/utils/phpContainers'

const props = defineProps({
  visible: Boolean,
  nodeId: String
})

const emit = defineEmits(['update:visible', 'created'])

const visibleModel = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const formRef = ref(null)
const loading = ref(false)
const phpLoading = ref(false)
const showAdvanced = ref(false)
const phpContainers = ref([])

const form = reactive({
  primaryDomain: '',
  type: 'static',
  subDomains: '',
  port: '',
  remark: '',
  proxyProtocol: 'http',
  proxyHost: '',
  proxyPort: '80',
  proxyPortAuto: true,
  selectedPhpPort: ''
})

const rules = {
  primaryDomain: [{ required: true, message: '请输入主域名', trigger: 'blur' }],
  type: [{ required: true, message: '请选择站点类型', trigger: 'change' }],
  selectedPhpPort: [{ required: true, message: '请选择 PHP 环境', trigger: 'change' }],
  proxyHost: [{ required: true, message: '请输入目标地址', trigger: 'blur' }],
  proxyPort: [{ required: true, message: '请输入端口', trigger: 'blur' }]
}

const getDefaultProxyPort = (protocol) => (protocol === 'https' ? '443' : '80')

// 监听类型变化，加载 PHP 环境
watch(() => form.type, async (newType) => {
  if (newType === 'php') {
    form.selectedPhpPort = ''
    loadPhpContainers()
  } else if (newType === 'proxy') {
    if (form.proxyPortAuto) {
      form.proxyPort = getDefaultProxyPort(form.proxyProtocol)
    }
  }
})

// 监听代理协议变化
watch(() => form.proxyProtocol, (newProtocol) => {
  if (form.type === 'proxy' && form.proxyPortAuto) {
    form.proxyPort = getDefaultProxyPort(newProtocol)
  }
})

// 监听对话框打开
watch(() => props.visible, (val) => {
  if (val) {
    resetForm()
  }
})

const resetForm = () => {
  form.primaryDomain = ''
  form.type = 'static'
  form.subDomains = ''
  form.port = ''
  form.remark = ''
  form.proxyProtocol = 'http'
  form.proxyHost = ''
  form.proxyPort = '80'
  form.proxyPortAuto = true
  form.selectedPhpPort = ''
  showAdvanced.value = false
}

const loadPhpContainers = async () => {
  if (!props.nodeId) return
  phpLoading.value = true
  try {
    const list = await fetchPhpContainers(props.nodeId)
    phpContainers.value = list.filter(c => c.state === 'running' && c.publicPort)
  } catch {
    ElMessage.error('加载 PHP 环境失败')
  } finally {
    phpLoading.value = false
  }
}

const buildProxyTarget = () => {
  const host = form.proxyHost.trim()
  if (!host) throw new Error('请输入代理地址')
  if (host.includes('://')) throw new Error('地址无需包含协议')

  // 简单验证并提取可能存在的后缀
  const cutIndex = host.search(/[/?#]/)
  const hostPart = cutIndex === -1 ? host : host.slice(0, cutIndex)
  const suffix = cutIndex === -1 ? '' : host.slice(cutIndex)

  if (hostPart.includes(':')) throw new Error('地址请勿包含端口')

  return `${form.proxyProtocol}://${hostPart}:${form.proxyPort}${suffix}`
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    loading.value = true

    // 域名转换
    const asciiPrimary = toAsciiDomain(form.primaryDomain)
    const subList = parseDomainList(form.subDomains)
    const asciiSubDomains = toAsciiDomainList(subList)

    const payload = {
      primaryDomain: asciiPrimary,
      type: form.type,
      serverNames: asciiSubDomains.length ? asciiSubDomains : undefined,
      listenPort: form.port ? parseInt(form.port, 10) : undefined,
      remark: form.remark
    }

    if (form.type === 'php') {
      payload.phpFastcgiPort = parseInt(form.selectedPhpPort, 10)
    } else if (form.type === 'proxy') {
      payload.proxyTarget = buildProxyTarget()
    }

    const resp = await fetch(`/api/forward/${props.nodeId}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const result = await resp.json()
    if (result.success) {
      ElMessage.success('创建成功')
      emit('created')
      visibleModel.value = false
    } else {
      ElMessage.error(result.message || '创建失败')
    }
  } catch (err) {
    if (err.message) ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.create-website-dialog :deep(.el-dialog__body) {
  padding-top: 10px;
}

.mb-4 {
  margin-bottom: 1rem;
}

.w-full {
  width: 100%;
}

.flex {
  display: flex;
}

.gap-4 {
  gap: 1rem;
}

.flex-1 {
  flex: 1;
}

.flex-\[2\] {
  flex: 2;
}

.proxy-config-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.proxy-config-row :deep(.el-form-item) {
  margin-bottom: 18px;
}
</style>
