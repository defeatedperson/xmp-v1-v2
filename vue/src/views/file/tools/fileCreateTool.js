// 文件名校验：用于创建/重命名的基础规则
export const validateFileName = (name) => {
  const raw = String(name || '').trim()
  if (!raw) return '名称不能为空'
  if (raw.includes('..')) return '名称不能包含 ..'
  if (raw.includes('\u0000')) return '名称包含非法字符'
  if (/[/\\:*?"<>|]/.test(raw)) return '名称包含非法字符'
  if (raw.length > 255) return '名称长度不能超过255个字符'
  return null
}

// 路径规范化：统一以 / 开头，根目录返回空字符串
export const normalizeRelativePath = (path) => {
  const raw = String(path || '').trim()
  if (!raw || raw === '/') return ''
  return raw.startsWith('/') ? raw.slice(1) : raw
}

// 创建文件/文件夹：优先返回后端 message/error 字段
export const createFileEntry = async ({ nodeId, path, type, name, content } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: null }
  }

  const payload = {
    path: normalizeRelativePath(path),
    type: type === 'directory' ? 'directory' : 'file',
    name: String(name || '').trim(),
  }

  if (payload.type === 'file' && content) {
    payload.content = content
  }

  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/file/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
    const msg = (result && (result.message || result.error)) || '创建失败'
    return { success: false, message: msg, data: result?.data || null }
  }

  return {
    success: true,
    message: result.message || '创建成功',
    data: result.data || null,
  }
}
