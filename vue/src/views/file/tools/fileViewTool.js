import { normalizeRelativePath } from './fileCreateTool'

const buildQuery = (path, name) => {
  const params = new URLSearchParams()
  const normalizedPath = normalizeRelativePath(path)
  if (normalizedPath) params.append('path', normalizedPath)
  params.append('name', String(name || '').trim())
  return params.toString()
}

export const fetchTextFile = async ({ nodeId, path, name } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  const fileName = String(name || '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: null }
  }
  if (!fileName) {
    return { success: false, message: '文件名不能为空', data: null }
  }

  const query = buildQuery(path, fileName)
  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/text?${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
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
    const msg = (result && (result.message || result.error)) || '加载文件失败'
    return { success: false, message: msg, data: result?.data || null }
  }

  return { success: true, message: result.message || '加载成功', data: result.data || null }
}

export const saveTextFile = async ({ nodeId, path, name, content } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  const fileName = String(name || '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: null }
  }
  if (!fileName) {
    return { success: false, message: '文件名不能为空', data: null }
  }

  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: normalizeRelativePath(path),
        name: fileName,
        content: String(content ?? ''),
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
    const msg = (result && (result.message || result.error)) || '保存失败'
    return { success: false, message: msg, data: result?.data || null }
  }

  return { success: true, message: result.message || '保存成功', data: result.data || null }
}

export const fetchImageBlobUrl = async ({ nodeId, path, name } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  const fileName = String(name || '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', url: '' }
  }
  if (!fileName) {
    return { success: false, message: '文件名不能为空', url: '' }
  }

  const query = buildQuery(path, fileName)
  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/image?${query}`, {
      method: 'GET',
    })
  } catch (e) {
    return { success: false, message: String(e && e.message ? e.message : '请求失败'), url: '' }
  }

  if (!resp.ok) {
    let msg = '图片加载失败'
    try {
      const text = await resp.text()
      if (text) msg = text
    } catch {
      msg = '图片加载失败'
    }
    return { success: false, message: msg, url: '' }
  }

  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  return { success: true, message: '加载成功', url }
}
