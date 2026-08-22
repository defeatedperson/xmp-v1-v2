import { normalizeRelativePath } from './fileCreateTool'

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

export const renameFileEntry = async ({ nodeId, file, currentPath = '/', newName } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: null }
  }
  if (!file) {
    return { success: false, message: '缺少重命名目标', data: null }
  }
  const targetName = String(newName || '').trim()
  if (!targetName) {
    return { success: false, message: '新名称不能为空', data: null }
  }

  const { path, name } = resolvePathParts(file, currentPath)
  const type = file?.type === 'directory' || file?.type === 'folder' ? 'directory' : 'file'

  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/file/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type, oldName: name, newName: targetName }),
    })
  } catch (e) {
    return { success: false, message: String(e && e.message ? e.message : '请求失败'), data: null }
  }

  let result = null
  try {
    result = await resp.json()
  } catch {
    result = null
  }

  if (!resp.ok || !result || result.success === false) {
    const msg = (result && (result.message || result.error)) || '重命名失败'
    return { success: false, message: msg, data: result?.data || null }
  }

  return {
    success: true,
    message: result.message || '重命名成功',
    data: result.data || null,
  }
}
