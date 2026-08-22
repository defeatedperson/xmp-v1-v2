<template>
  <div class="file-toolbar">
    <div class="header-left">
      <NodeSelector
        :node-type="1"
        @node-selected="handleNodeSelected"
        class="node-select-wrapper"
      />
      <el-button
        class="transfer-button"
        :type="transferVisible ? 'primary' : 'default'"
        :plain="!transferVisible"
        @click="handleTransfer"
      >
        文件中转站
      </el-button>
    </div>

    <div class="header-right">
      <el-input
        v-model="searchQuery"
        placeholder="搜索文件名称..."
        class="search-input"
        clearable
        @keyup.enter="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <el-button-group class="action-buttons">
        <el-button :icon="Refresh" @click="handleRefresh">刷新</el-button>
        <el-button @click="handleBatch">批量操作</el-button>
        <el-button :icon="Upload" @click="handleUpload">上传</el-button>
        <el-button type="primary" :icon="Plus" @click="handleCreate">新建</el-button>
      </el-button-group>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Search, Refresh, Upload, Plus } from '@element-plus/icons-vue'
import NodeSelector from '@/components/NodeSelector.vue'

defineProps({
  transferVisible: { type: Boolean, default: false },
})

const emit = defineEmits(['node-selected', 'search', 'refresh', 'batch', 'upload', 'create', 'transfer'])

const searchQuery = ref('')

const handleNodeSelected = (node) => {
  emit('node-selected', node)
}

const handleSearch = () => {
  emit('search', searchQuery.value)
}

const handleRefresh = () => {
  emit('refresh')
}

const handleBatch = () => {
  emit('batch')
}

const handleUpload = () => {
  emit('upload')
}

const handleCreate = () => {
  emit('create')
}

const handleTransfer = () => {
  emit('transfer')
}
</script>

<style scoped>
.file-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-bg-color-overlay);
  padding: 16px 20px;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  gap: 16px;
  flex-wrap: wrap;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.node-select-wrapper {
  width: 220px;
}

.search-input {
  width: 240px;
}

.transfer-button {
  height: 32px;
}
</style>
