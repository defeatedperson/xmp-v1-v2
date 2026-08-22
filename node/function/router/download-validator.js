const path = require('path')
const fs = require('fs')
const { getPath } = require('../../config/paths')

async function validateDownloadParams(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: '缺少下载参数', status: 400 }
  }

  const relPath = String(payload.path || '')
  const fileName = String(payload.name || '')
  const t = String(payload.type || '').toLowerCase()

  if (!relPath || !['file', 'folder'].includes(t)) {
    return { valid: false, error: '参数无效：需要 path、name 和 type(file/folder)', status: 400 }
  }

  const wwwBase = path.resolve(getPath('data', 'www'))
  const fullPath = path.join(wwwBase, relPath, fileName)

  let realBase, realTarget
  try {
    realBase = fs.realpathSync(wwwBase)
    realTarget = fs.realpathSync(fullPath)
    if (!realTarget.startsWith(realBase)) {
      return { valid: false, error: '文件路径不安全', status: 403 }
    }
  } catch {
    return { valid: false, error: '文件不存在', status: 404 }
  }

  let stat
  try {
    stat = fs.statSync(fullPath)
  } catch {
    return { valid: false, error: '文件不存在', status: 404 }
  }

  if (t === 'folder') {
    if (!stat.isDirectory()) {
      return { valid: false, error: '指定路径不是文件夹', status: 400 }
    }
  } else {
    if (!stat.isFile()) {
      return { valid: false, error: '指定路径不是文件', status: 400 }
    }
  }

  return {
    valid: true,
    relPath,
    type: t,
    fullPath,
    stat,
    wwwBase
  }
}

module.exports = {
  validateDownloadParams
}
