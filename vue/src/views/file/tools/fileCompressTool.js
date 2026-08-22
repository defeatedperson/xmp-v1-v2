import { normalizeRelativePath } from './fileCreateTool'

export const validateArchiveName = (name) => {
  const raw = String(name || '').trim()
  if (!raw) return null
  if (raw.includes('..')) return '名称不能包含 ..'
  if (raw.includes('\u0000')) return '名称包含非法字符'
  if (/[/\\:*?"<>|]/.test(raw)) return '名称包含非法字符'
  if (raw.length > 255) return '名称长度不能超过255个字符'

  const reservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ]
  const nameWithoutExt = raw.replace(/\.zip$/i, '')
  if (reservedNames.includes(nameWithoutExt.toUpperCase())) {
    return '不能使用系统保留名称'
  }

  return null
}

export const createCompressTask = async ({ nodeId, path, sourceName, archiveName } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', taskId: null, data: null }
  }
  if (!sourceName) {
    return { success: false, message: '缺少压缩目标', taskId: null, data: null }
  }

  const payload = {
    path: normalizeRelativePath(path),
    sourceName: String(sourceName || '').trim(),
  }
  if (archiveName) {
    payload.archiveName = String(archiveName || '').trim()
  }

  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/file/compress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { success: false, message: String(e && e.message ? e.message : '请求失败'), taskId: null, data: null }
  }

  let result = null
  try {
    result = await resp.json()
  } catch {
    result = null
  }

  if (!resp.ok || !result || result.success === false) {
    const msg = (result && (result.message || result.error)) || '压缩失败'
    return { success: false, message: msg, taskId: result?.taskId || null, data: result?.data || null }
  }

  return {
    success: true,
    message: result.message || '压缩任务已创建',
    taskId: result.taskId || null,
    data: result.data || null,
  }
}
