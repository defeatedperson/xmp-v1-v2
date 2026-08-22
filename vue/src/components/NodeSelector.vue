<template>
  <div class="node-selector" v-loading="loading">
    <div class="selector-container">
      <el-select
        v-model="selectedNodeId"
        :placeholder="placeholder"
        :disabled="loading"
        @change="handleNodeChange"
        filterable
        class="node-select"
      >
        <el-option
          v-for="node in nodeList"
          :key="node.id"
          :label="node.name"
          :value="node.id"
        />
      </el-select>

      <el-button
        @click="handleRefresh"
        :loading="loading"
        :icon="Refresh"
        class="refresh-btn"
        title="刷新节点列表"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useNodeStore } from '@/stores/node'

/**
 * NodeSelector 组件 (Pinia 重构版)
 *
 * 优化点：
 * 1. 响应式状态：通过 Pinia 管理 selectedNodeId，实现全局组件秒级同步，无需事件广播。
 * 2. 数据单例：全局共享节点列表，减少 API 重复请求。
 * 3. 逻辑解耦：将复杂的持久化和过滤逻辑移至 Store，组件只负责 UI 展现。
 */

const props = defineProps({
  // 1: 通用被控, 2: 仅监控, 3: xcc套件
  nodeType: {
    type: Number,
    required: true,
    validator: (value) => [1, 2, 3].includes(value)
  },
  placeholder: {
    type: String,
    default: '请选择节点'
  }
})

const emit = defineEmits(['node-selected', 'error'])

const nodeStore = useNodeStore()

// 计算当前类型的节点列表
const nodeList = computed(() => nodeStore.getNodesByType(props.nodeType))

// 使用 Pinia 中的选中 ID 作为 v-model 绑定值
const selectedNodeId = computed({
  get: () => nodeStore.selectedNodeIds[props.nodeType] || '',
  set: (val) => nodeStore.setNodeId(props.nodeType, val)
})

const loading = computed(() => nodeStore.loading)

// 统一的校验与兜底逻辑
const validateAndFallback = () => {
  const currentId = selectedNodeId.value
  const exists = nodeList.value.some(n => n.id === currentId)

  if (nodeList.value.length > 0) {
    if (!currentId || !exists) {
      // 选中 ID 最小的
      const minIdNode = nodeList.value.reduce((min, cur) =>
        parseInt(cur.id) < parseInt(min.id) ? cur : min
      )
      selectedNodeId.value = minIdNode.id
    }
  } else {
    // 列表为空，显式清空选中项，防止显示历史残留的 ID (如 "23")
    selectedNodeId.value = ''
  }
}

// 初始化与加载
const init = async () => {
  try {
    nodeStore.initSelectedIds(props.nodeType)
    await nodeStore.fetchNodes()
    validateAndFallback()
    // 初始通知父组件
    emitCurrentNode()
  } catch (err) {
    emit('error', err)
  }
}

// 通知父组件当前选中的节点对象
const emitCurrentNode = () => {
  const node = nodeList.value.find(n => n.id === selectedNodeId.value)
  if (node) {
    emit('node-selected', { ...node })
  }
}

// 手动切换处理
const handleNodeChange = () => {
  emitCurrentNode()
}

// 刷新
const handleRefresh = async () => {
  await nodeStore.refreshNodes()
  validateAndFallback()
  emitCurrentNode()
}

onMounted(() => {
  init()
})

// 监听类型变化
watch(() => props.nodeType, () => {
  init()
})

// 监听 Pinia 中的值变化（实现跨组件同步后的回调）
watch(selectedNodeId, () => {
  emitCurrentNode()
})
</script>

<style scoped>
.node-selector {
  display: inline-block;
}

.selector-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-select {
  width: 220px;
}

.refresh-btn {
  padding: 8px 12px;
}

/* 适配移动端 */
@media (max-width: 768px) {
  .node-selector {
    width: 100%;
  }
  .selector-container {
    width: 100%;
  }
  .node-select {
    flex: 1;
  }
}
</style>
