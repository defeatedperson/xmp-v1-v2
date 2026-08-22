const fs = require('fs')
const fsp = fs.promises
const crypto = require('crypto')
const { getPath } = require('../../config/paths')
const MAX_ITEMS = 6

function getFilePath() {
  return getPath('data', 'ssh', 'templates.json')
}

async function ensureStore() {
  const dir = getPath('data', 'ssh')
  await fsp.mkdir(dir, { recursive: true })
  const file = getFilePath()
  try {
    await fsp.access(file, fs.constants.F_OK)
  } catch {
    await writeJson([])
  }
}

async function readJson() {
  await ensureStore()
  const file = getFilePath()
  try {
    const content = await fsp.readFile(file, 'utf8')
    const data = JSON.parse(content)
    return Array.isArray(data) ? data : []
  } catch {
    await writeJson([])
    return []
  }
}

function calcETag(data) {
  const h = crypto.createHash('sha256')
  h.update(JSON.stringify(data))
  return h.digest('hex')
}

async function writeJson(data) {
  const file = getFilePath()
  const tmp = file + '.tmp'
  const json = JSON.stringify(data)
  await fsp.writeFile(tmp, json, 'utf8')
  await fsp.rename(tmp, file)
}

function isValidPort(n) {
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

function validateItem(x) {
  if (!x || typeof x !== 'object') return false
  const title = typeof x.title === 'string' ? x.title.trim() : ''
  const user = typeof x.user === 'string' ? x.user.trim() : ''
  const password = typeof x.password === 'string' ? x.password : ''
  const port = x.port
  if (!title || title.length > 8) return false
  if (!isValidPort(port)) return false
  if (!user || user.length > 64) return false
  if (password && password.length > 128) return false
  return true
}

async function saveJson(data, opts = {}) {
  if (!Array.isArray(data)) {
    const err = new Error('数据必须为数组')
    err.code = 'EINVAL'
    throw err
  }
  if (data.length > MAX_ITEMS) {
    const err = new Error('最多只能有6条模板')
    err.code = 'LIMIT_EXCEEDED'
    throw err
  }
  const ok = data.every(validateItem)
  if (!ok) {
    const err = new Error('模板字段不合法或长度超限')
    err.code = 'EINVAL'
    throw err
  }
  if (opts.etag) {
    const current = await readJson()
    const currentTag = calcETag(current)
    if (currentTag !== opts.etag) {
      const err = new Error('内容已变更')
      err.code = 'ETAG_MISMATCH'
      throw err
    }
  }
  await ensureStore()
  await writeJson(data)
  return { etag: calcETag(data) }
}

module.exports = { readJson, saveJson, calcETag }

