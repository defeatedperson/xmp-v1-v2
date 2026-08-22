import { normalizeRelativePath } from './fileCreateTool'

export const setFilePermission = async ({ nodeId, path, name, permissions, recursive } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  const fileName = String(name || '').trim()
  const perms = String(permissions || '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '请选择节点', data: null }
  }
  if (!fileName) {
    return { success: false, message: '缺少目标名称', data: null }
  }
  if (!/^\d{3}$/.test(perms)) {
    return { success: false, message: '权限格式无效（需3位数字）', data: null }
  }
  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/file/permission/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: normalizeRelativePath(path),
        name: fileName,
        permissions: perms,
        recursive: Boolean(recursive),
      }),
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
    const msg = (result && (result.message || result.error)) || '权限设置失败'
    return { success: false, message: msg, data: result?.data || null }
  }
  return { success: true, message: result.message || '权限设置成功', data: result.data || null }
}
