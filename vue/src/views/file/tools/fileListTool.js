export const fetchFileList = async ({ nodeId, path = '', search = '' } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: [], currentPath: '', count: 0 }
  }

  const params = new URLSearchParams()
  if (path) params.append('path', path)
  if (search) params.append('search', search)
  const query = params.toString()
  const url = `/api/forward/${encodeURIComponent(normalizedNodeId)}/file-list${query ? `?${query}` : ''}`

  let resp = null
  try {
    resp = await fetch(url)
  } catch (e) {
    return { success: false, message: String(e && e.message ? e.message : '请求失败'), data: [], currentPath: '', count: 0 }
  }

  let result = null
  try {
    result = await resp.json()
  } catch {
    result = null
  }

  if (!resp.ok || !result || result.success === false) {
    const msg = (result && (result.message || result.error)) || '获取文件列表失败'
    return {
      success: false,
      message: msg,
      data: Array.isArray(result?.data) ? result.data : [],
      currentPath: result?.currentPath || '',
      count: typeof result?.count === 'number' ? result.count : 0,
    }
  }

  const list = Array.isArray(result.data) ? result.data : []
  return {
    success: true,
    message: result.message || '',
    data: list,
    currentPath: result.currentPath || '',
    count: typeof result.count === 'number' ? result.count : list.length,
  }
}

export const pickFileIdentity = (nodeId, file) => ({
  nodeId: String(nodeId ?? '').trim(),
  relativePath: String(file?.relativePath ?? ''),
  type: String(file?.type ?? ''),
})
