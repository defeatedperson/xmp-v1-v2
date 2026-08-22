import { normalizeRelativePath } from './fileCreateTool'

export const buildFullPath = (relativePath, currentPath) => {
  const fileName = String(relativePath || '').split('/').pop()
  const fileDir = String(relativePath || '').substring(0, String(relativePath || '').lastIndexOf('/'))
  const uploadPath = normalizeRelativePath(currentPath)
  let fullDirPath = ''
  if (uploadPath && fileDir) {
    fullDirPath = `${uploadPath}/${fileDir}`
  } else if (uploadPath) {
    fullDirPath = uploadPath
  } else if (fileDir) {
    fullDirPath = fileDir
  }
  return { fileName, fullDirPath }
}

export const checkFileExists = async ({ nodeId, currentPath = '/', relativePath } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: null }
  }
  const { fileName, fullDirPath } = buildFullPath(relativePath, currentPath)
  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/file/upload/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, relativePath: fullDirPath }),
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
    const msg = (result && (result.message || result.error)) || '检查失败'
    return { success: false, message: msg, data: result?.data || null }
  }
  return { success: true, message: result.message || '检查成功', data: result.data || null }
}

export const generateFileHash = async (file) => {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const sliceFile = (file, chunkSize) => {
  const chunks = []
  let start = 0
  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size)
    chunks.push(file.slice(start, end))
    start = end
  }
  return chunks
}

export const uploadChunk = async ({
  nodeId,
  fileHash,
  chunk,
  chunkIndex,
  totalChunks,
  fileName,
  fullDirPath,
} = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: null }
  }
  const formData = new FormData()
  formData.append('chunk', chunk, `${fileName}.part${chunkIndex}`)
  formData.append('fileHash', fileHash)
  formData.append('chunkIndex', chunkIndex)
  formData.append('totalChunks', totalChunks)
  formData.append('fileName', fileName)
  formData.append('relativePath', fullDirPath)
  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/file/upload/chunk`, {
      method: 'POST',
      body: formData,
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
    const msg = (result && (result.message || result.error)) || '分片上传失败'
    return { success: false, message: msg, data: result?.data || null }
  }
  return { success: true, message: result.message || '上传成功', data: result.data || null }
}

export const mergeChunks = async ({ nodeId, fileHash, totalChunks, fileName, fullDirPath } = {}) => {
  const normalizedNodeId = String(nodeId ?? '').trim()
  if (!normalizedNodeId) {
    return { success: false, message: '节点ID缺失', data: null }
  }
  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(normalizedNodeId)}/file/upload/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, fileHash, totalChunks, relativePath: fullDirPath }),
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
    const msg = (result && (result.message || result.error)) || '分片合并失败'
    return { success: false, message: msg, data: result?.data || null }
  }
  return { success: true, message: result.message || '合并成功', data: result.data || null }
}
