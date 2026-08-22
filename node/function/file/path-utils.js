const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const { getPath } = require('../../config/paths')

function normalizeRelative(p) {
  let s = String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (s) s = '/' + s
  return s
}

function validateFileName(name) {
  if (!String(name).trim() || String(name).length > 255) return false
  const illegal = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\u0000']
  for (const ch of illegal) {
    if (name.includes(ch.replace('\\u0000', '\u0000'))) return false
  }
  if (name === '.' || name === '..' || name.includes('..')) return false
  return true
}

function getWwwBase() {
  return path.resolve(getPath('data', 'www'))
}

async function exists(p) {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}

async function resolveFullPath(relativePath, name) {
  if (!validateFileName(name)) return { ok: false, code: 400, error: '文件名包含非法字符' }
  const wwwBase = getWwwBase()
  let rel = normalizeRelative(relativePath)
  if (rel.includes('..')) return { ok: false, code: 403, error: '文件路径不安全' }
  const full = path.join(wwwBase, rel, name)
  try {
    const realBase = await fsp.realpath(wwwBase)
    let realFull
    try {
      realFull = await fsp.realpath(full)
      if (!realFull.startsWith(realBase)) return { ok: false, code: 403, error: '文件路径不安全' }
    } catch {
      let parent = path.dirname(full)
      while (parent !== path.dirname(parent) && !(await exists(parent))) {
        parent = path.dirname(parent)
      }
      const realParent = await fsp.realpath(parent)
      if (!realParent.startsWith(realBase)) return { ok: false, code: 403, error: '无效的目标路径' }
      const remaining = full.slice(realParent.length)
      if (remaining.includes('..')) return { ok: false, code: 403, error: '文件路径不安全' }
    }
    return { ok: true, full, wwwBase }
  } catch {
    return { ok: false, code: 500, error: '服务器内部错误' }
  }
}

module.exports = {
  normalizeRelative,
  validateFileName,
  resolveFullPath
}

