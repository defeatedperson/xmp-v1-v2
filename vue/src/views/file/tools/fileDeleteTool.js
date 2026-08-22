const normalizeRelativePath = (path) => {
  const raw = String(path || '').trim()
  if (!raw || raw === '/') return ''
  return raw.startsWith('/') ? raw.slice(1) : raw
}

const resolvePathParts = (file, currentPath) => {
  const relativePath = String(file?.relativePath || '').trim()
  if (relativePath) {
    const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
    const parts = normalized.split('/').filter(Boolean)
    const name = parts.pop() || ''
    const parentPath = parts.length ? `/${parts.join('/')}` : '/'
    return { path: normalizeRelativePath(parentPath), name }
  }
  const name = String(file?.name || '').trim()
  return { path: normalizeRelativePath(currentPath), name }
}

export const deleteFileEntry = async ({ nodeId, file, currentPath = '/', force = false } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: null, taskId: null }
  }
  if (!file) {
    return { success: false, message: '缺少删除目标', data: null, taskId: null }
  }

  const { path, name } = resolvePathParts(file, currentPath)
  const type = file?.type === 'directory' || file?.type === 'folder' ? 'directory' : 'file'

  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/file/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type, name, force: Boolean(force) }),
    })
  } catch (e) {
    return { success: false, message: String(e && e.message ? e.message : '请求失败'), data: null, taskId: null }
  }

  let result = null
  try {
    result = await resp.json()
  } catch {
    result = null
  }

  if (!resp.ok || !result || result.success === false) {
    const msg = (result && (result.message || result.error)) || '删除失败'
    return { success: false, message: msg, data: result?.data || null, taskId: result?.taskId || null }
  }

  return {
    success: true,
    message: result.message || '删除成功',
    data: result.data || null,
    taskId: result.taskId || null,
  }
}
