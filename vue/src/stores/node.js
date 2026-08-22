import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 节点状态管理 Store
 * 
 * 优势：
 * 1. 数据共享：全局只有一个节点列表，避免重复请求。
 * 2. 状态响应：节点切换时，所有引用此 Store 的组件都会实时自动更新。
 * 3. 逻辑解耦：将 API 请求、持久化逻辑与 UI 组件分离。
 */
export const useNodeStore = defineStore('node', () => {
  // 所有节点列表
  const nodes = ref([])
  // 各类型的选中节点 ID 映射表，例如 { 1: '101', 2: '202' }
  const selectedNodeIds = ref({})
  const loading = ref(false)

  // 获取存储 key 的辅助函数
  const getStoreKey = (type) => `selected_node_id_type_${type}`

  /**
   * 初始化选中状态
   * 从 localStorage 恢复历史选择
   */
  const initSelectedIds = (type) => {
    if (!selectedNodeIds.value[type]) {
      const storedId = localStorage.getItem(getStoreKey(type))
      if (storedId) {
        selectedNodeIds.value[type] = storedId
      }
    }
  }

  /**
   * 获取并过滤节点列表
   */
  const fetchNodes = async () => {
    if (nodes.value.length > 0) return // 如果已有数据，不再重复请求（可根据需要添加刷新逻辑）
    
    loading.value = true
    try {
      const response = await fetch('/api/node/type')
      const result = await response.json()
      if (result.success && result.data) {
        nodes.value = result.data.map(n => ({
          id: String(n.id),
          type: parseInt(n.type),
          remark: n.remark,
          name: n.remark ? `${n.remark} (${n.id})` : `节点 ${n.id}`
        }))
      }
    } catch (error) {
      console.error('Store: 获取节点列表失败', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  /**
   * 强制刷新节点列表
   */
  const refreshNodes = async () => {
    nodes.value = []
    await fetchNodes()
  }

  /**
   * 设置选中节点并持久化
   */
  const setNodeId = (type, id) => {
    selectedNodeIds.value[type] = id
    if (id) {
      localStorage.setItem(getStoreKey(type), id)
    } else {
      localStorage.removeItem(getStoreKey(type))
    }
  }

  /**
   * 根据类型获取过滤后的节点列表
   */
  const getNodesByType = (type) => {
    return nodes.value.filter(n => n.type === parseInt(type))
  }

  return {
    nodes,
    selectedNodeIds,
    loading,
    fetchNodes,
    refreshNodes,
    setNodeId,
    initSelectedIds,
    getNodesByType
  }
})
