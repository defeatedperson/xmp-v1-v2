const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const fsp = require('fs').promises
const { normalizeRelative, resolveFullPath } = require('../function/file/path-utils')

const MAX_SIZE = 10 * 1024 * 1024
const SNIFF_BYTES = 8192

function isImageExt(name) {
  const ext = path.parse(String(name)).ext.toLowerCase().replace(/^\./, '')
  const allowed = ['jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff','tif']
  return allowed.includes(ext)
}

function isTextExt(name) {
  const ext = path.parse(String(name)).ext.toLowerCase().replace(/^\./, '')
  const allowed = ['txt','log','ini','cfg','conf','html','htm','css','js','php','py','java','c','cpp','h','sh','bat','ps1','json','xml','yaml','yml','csv','md','rst','tex']
  return allowed.includes(ext)
}

function isBinaryExt(name) {
  const ext = path.parse(String(name)).ext.toLowerCase().replace(/^\./, '')
  const allowed = [
    'mp4','mkv','avi','mov','wmv','flv','webm','m4v',
    'mp3','flac','wav','aac','ogg','m4a','wma',
    'zip','rar','7z','tar','gz','bz2','xz',
    'exe','dll','so','bin','dmg','iso','msi',
    'sqlite','db','mdb','accdb'
  ]
  return allowed.includes(ext)
}

function classifyByExt(name) {
  if (isTextExt(name)) return 'text'
  if (isImageExt(name) || isBinaryExt(name)) return 'binary'
  return 'unknown'
}

function isLikelyTextBuffer(buf) {
  if (!buf || buf.length === 0) return true
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0) return false
  }
  let controls = 0
  for (let i = 0; i < buf.length; i += 1) {
    const b = buf[i]
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) controls += 1
  }
  return controls / buf.length <= 0.02
}

async function canOpenAsText(fullPath) {
  const handle = await fsp.open(fullPath, 'r')
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0)
    return isLikelyTextBuffer(buffer.slice(0, bytesRead))
  } finally {
    await handle.close()
  }
}

function mimeTypeFor(name) {
  const ext = path.parse(String(name)).ext.toLowerCase().replace(/^\./, '')
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', tiff: 'image/tiff', tif: 'image/tiff'
  }
  return map[ext] || 'application/octet-stream'
}

router.get('/image', async (req, res) => {
  try {
    const { path: relativePath = '', name = '' } = req.query
    if (!name || !String(name).trim()) return res.status(400).send('Missing parameter: name')
    if (!isImageExt(name)) return res.status(400).send('Unsupported image format')
    const r = await resolveFullPath(relativePath, name)
    if (!r.ok) return res.status(r.code).send(r.error)
    if (!fs.existsSync(r.full) || !fs.statSync(r.full).isFile()) return res.status(404).send('File not found')
    const size = fs.statSync(r.full).size
    if (size > MAX_SIZE) return res.status(400).send('File size exceeds 10MB')
    res.setHeader('Content-Type', mimeTypeFor(name))
    res.setHeader('Content-Length', String(size))
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Last-Modified', new Date(fs.statSync(r.full).mtime).toUTCString())
    fs.createReadStream(r.full).pipe(res)
  } catch {
    return res.status(500).send('Internal Server Error')
  }
})

router.get('/text', async (req, res) => {
  try {
    const { path: relativePath = '', name = '' } = req.query
    if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: '文件名不能为空' })
    const typeByExt = classifyByExt(name)
    if (typeByExt === 'binary') return res.status(400).json({ success: false, error: '不支持的文件类型，仅支持文本文件' })
    const r = await resolveFullPath(relativePath, name)
    if (!r.ok) return res.status(r.code).json({ success: false, error: r.error })
    if (!fs.existsSync(r.full) || !fs.statSync(r.full).isFile()) return res.status(404).json({ success: false, error: '文件不存在' })
    const size = fs.statSync(r.full).size
    if (size > MAX_SIZE) return res.status(400).json({ success: false, error: '文件大小超过限制（最大10MB）' })
    if (typeByExt === 'unknown') {
      const canOpen = await canOpenAsText(r.full)
      if (!canOpen) return res.status(400).json({ success: false, error: '无法按文本打开，可能为二进制文件' })
    }
    const content = await fsp.readFile(r.full, 'utf8')
    const st = await fsp.stat(r.full)
    const info = {
      size: st.size,
      modified: new Date(st.mtime).toISOString().slice(0, 19).replace('T', ' '),
      created: new Date(st.ctime).toISOString().slice(0, 19).replace('T', ' '),
      permissions: (st.mode & parseInt('777', 8)).toString(8).padStart(3, '0'),
      extension: path.parse(r.full).ext.replace(/^\./, '')
    }
    return res.json({ success: true, message: '文件内容获取成功', data: { name, relativePath: normalizeRelative(path.relative(r.wwwBase, r.full)), parentPath: normalizeRelative(relativePath), content, size, info } })
  } catch {
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

router.post('/text', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    const { path: relativePath = '', name = '', content } = payload
    if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: '文件名不能为空' })
    if (typeof content === 'undefined') return res.status(400).json({ success: false, error: '缺少必需参数：content' })
    const typeByExt = classifyByExt(name)
    if (typeByExt === 'binary') return res.status(400).json({ success: false, error: '不支持的文件类型，仅支持文本文件' })
    const r = await resolveFullPath(relativePath, name)
    if (!r.ok) return res.status(r.code).json({ success: false, error: r.error })
    if (!fs.existsSync(r.full) || !fs.statSync(r.full).isFile()) return res.status(404).json({ success: false, error: '文件不存在' })
    const originalSize = fs.statSync(r.full).size
    const newSize = Buffer.byteLength(String(content || ''), 'utf8')
    if (newSize > MAX_SIZE) return res.status(400).json({ success: false, error: '文件内容大小超过限制（最大10MB）' })
    if (typeByExt === 'unknown') {
      const canOpen = await canOpenAsText(r.full)
      if (!canOpen) return res.status(400).json({ success: false, error: '无法按文本打开，可能为二进制文件' })
    }
    try { await fsp.access(r.full, fs.constants.W_OK) } catch { return res.status(403).json({ success: false, error: '文件不可写' }) }
    await fsp.writeFile(r.full, String(content || ''), 'utf8')
    const st = await fsp.stat(r.full)
    const info = {
      size: st.size,
      modified: new Date(st.mtime).toISOString().slice(0, 19).replace('T', ' '),
      created: new Date(st.ctime).toISOString().slice(0, 19).replace('T', ' '),
      permissions: (st.mode & parseInt('777', 8)).toString(8).padStart(3, '0'),
      extension: path.parse(r.full).ext.replace(/^\./, '')
    }
    return res.json({ success: true, message: '文件内容修改成功', data: { name, relativePath: normalizeRelative(path.relative(r.wwwBase, r.full)), parentPath: normalizeRelative(relativePath), originalSize, newSize, info, updated: new Date().toISOString().slice(0, 19).replace('T', ' ') } })
  } catch {
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

module.exports = router
