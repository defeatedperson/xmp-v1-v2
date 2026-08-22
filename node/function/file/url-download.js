const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const https = require('https')
const { getPath } = require('../../config/paths')

class FileUrlDownloadManager {
  constructor(wwwPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.basePath = path.resolve(this.wwwPath)
    this.userAgent = 'Mozilla/5.0'
    this.maxRedirects = 5
    this.timeoutMs = 30000
    this.allowSelfSigned = true
  }

  async downloadFromNode(nodeAddress, options = {}, onProgress) {
    const {
      type = 'file',
      path: sourcePath = '',
      name = '',
      clientCert = null,
      clientKey = null,
      savePath = '/文件接收柜'
    } = options

    if (!clientCert || !clientKey) {
      return this.errorResponse('缺少客户端证书或密钥')
    }

    if (!nodeAddress) {
      return this.errorResponse('缺少节点地址')
    }

    if (!['file', 'folder'].includes(type)) {
      return this.errorResponse('无效的类型参数')
    }

    this.clientCert = clientCert
    this.clientKey = clientKey

    const baseUrl = `https://${nodeAddress}`

    if (type === 'file') {
      return this.downloadFile(baseUrl, sourcePath, name, savePath, onProgress)
    } else {
      return this.downloadFolder(baseUrl, sourcePath, name, savePath, onProgress)
    }
  }

  normalizeSourcePath(p) {
    const s = String(p || '').trim()
    return s === '' ? '/' : s
  }

  async downloadFile(baseUrl, sourcePath, name, savePath, onProgress) {
    if (onProgress) onProgress(10, '开始下载文件')

    const safePath = this.normalizeSourcePath(sourcePath)
    const downloadUrl = `${baseUrl}/file/download?path=${encodeURIComponent(safePath)}&name=${encodeURIComponent(name)}&type=file`

    if (onProgress) onProgress(30, '正在下载')

    const result = await this.download(downloadUrl, savePath, name, false, onProgress)

    if (onProgress) onProgress(100, '下载完成')

    return result
  }

  async downloadFolder(baseUrl, sourcePath, name, savePath, onProgress) {
    if (onProgress) onProgress(10, '开始打包文件夹')

    const safePath = this.normalizeSourcePath(sourcePath)
    const prepareUrl = `${baseUrl}/file/download/prepare?path=${encodeURIComponent(safePath)}&name=${encodeURIComponent(name)}&type=folder`

    if (onProgress) onProgress(20, '等待打包完成')

    const prepareResult = await this.waitForPrepareComplete(prepareUrl)

    if (!prepareResult.success) {
      return this.errorResponse(prepareResult.error || '打包失败')
    }

    if (onProgress) onProgress(60, '开始下载')

    const { path: downloadPath, name: downloadName } = prepareResult
    const downloadUrl = `${baseUrl}/file/download?path=${encodeURIComponent(downloadPath)}&name=${encodeURIComponent(downloadName)}&type=file`

    const result = await this.download(downloadUrl, savePath, downloadName, false, onProgress)

    if (onProgress) onProgress(100, '下载完成')

    return result
  }

  async waitForPrepareComplete(prepareUrl, intervalMs = 10000) {
    while (true) {
      try {
        const res = await this.httpRequest(prepareUrl)

        if (res.statusCode === 200 && res.json) {
          const { success, status } = res.json

          if (status === 'pending') {
            await new Promise(r => setTimeout(r, intervalMs))
            continue
          }

          if (status === 'completed') {
            return {
              success: true,
              path: res.json.path,
              name: res.json.name
            }
          }

          if (status === 'failed' || success === false) {
            return { success: false, error: res.json.error || '打包失败' }
          }
        }

        return { success: false, error: '接口响应异常' }
      } catch {
        return { success: false, error: '网络请求失败' }
      }
    }
  }

  async download(url, relativePath = '', fileName = null, overwrite = false, onProgress) {
    try {
      const rel = this.normalizePath(relativePath)
      const targetDir = path.join(this.basePath, rel)
      if (!await this.validatePath(targetDir)) return this.errorResponse('无效的目标路径')

      await fs.mkdir(targetDir, { recursive: true, mode: 0o755 })

      const name = fileName || 'download.tmp'
      if (!this.validateName(name)) return this.errorResponse('文件名包含非法字符')

      const fullPath = path.join(targetDir, name)
      if (!await this.validatePath(fullPath)) return this.errorResponse('下载路径不安全')

      if (await this.exists(fullPath) && !overwrite) {
        return this.errorResponse('文件已存在')
      }

      const start = Date.now()
      const res = await this.streamDownload(url, fullPath, onProgress)

      if (!res.success) {
        try { await fs.unlink(fullPath) } catch {}
        return res
      }

      try { await fs.chmod(fullPath, 0o644) } catch {}
      const stat = await fs.stat(fullPath)

      return this.successResponse(rel, name, fullPath, {
        downloaded: stat.size,
        duration: Math.max(1, Math.floor((Date.now() - start) / 1000)),
        speed: stat.size > 0 ? Math.round(stat.size / Math.max(1, Math.floor((Date.now() - start) / 1000))) : 0
      })
    } catch (e) {
      return this.errorResponse('下载失败: ' + e.message)
    }
  }

  async httpRequest(urlString) {
    const u = new URL(urlString)

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': this.userAgent, 'Accept': '*/*' },
        timeout: this.timeoutMs,
        cert: this.clientCert,
        key: this.clientKey,
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined
      }

      const req = https.request(reqOptions, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              json: data ? JSON.parse(data) : null
            })
          } catch {
            resolve({ statusCode: res.statusCode, json: null })
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('请求超时'))
      })

      req.end()
    })
  }

  async streamDownload(url, fullPath, onProgress, redirects = 0) {
    try {
      const u = new URL(url)
      if (!['http:', 'https:'].includes(u.protocol)) return this.errorResponse('无效的下载URL')

      await new Promise((resolve, reject) => fsSync.open(fullPath, 'w', (err, fd) => err ? reject(err) : fsSync.close(fd, resolve)))

      const out = fsSync.createWriteStream(fullPath)

      return await new Promise((resolve) => {
        const reqOptions = {
          headers: { 'User-Agent': this.userAgent, 'Accept': '*/*' },
          cert: this.clientCert,
          key: this.clientKey,
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined
        }

        const req = https.get(url, reqOptions, (response) => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            out.destroy()
            if (redirects >= this.maxRedirects) return resolve(this.errorResponse('重定向次数过多'))
            const loc = response.headers.location.startsWith('http') ? response.headers.location : new URL(response.headers.location, url).toString()
            return this.streamDownload(loc, fullPath, onProgress, redirects + 1).then(resolve)
          }

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            out.destroy()
            return resolve(this.errorResponse('远程文件不可访问'))
          }

          const totalSize = parseInt(response.headers['content-length'] || 0, 10)
          let downloadedSize = 0

          response.on('data', (chunk) => {
            downloadedSize += chunk.length
            if (onProgress && totalSize > 0) {
              const progress = Math.round((downloadedSize / totalSize) * 50) + 50
              onProgress(progress, `下载中 ${Math.round((downloadedSize / 1024 / 1024) * 10) / 10} MB`)
            }
          })

          req.setTimeout(this.timeoutMs, () => { try { req.destroy(new Error('下载超时')) } catch {} })
          response.on('error', (err) => { try { out.destroy() } catch {}; resolve(this.errorResponse('下载异常: ' + err.message)) })
          out.on('error', (err) => { resolve(this.errorResponse('写入失败: ' + err.message)) })
          out.on('finish', () => { resolve({ success: true }) })
          response.pipe(out)
        })

        req.on('error', (err) => { try { out.destroy() } catch {}; resolve(this.errorResponse('请求失败: ' + err.message)) })
      })
    } catch (e) {
      return this.errorResponse('下载异常: ' + e.message)
    }
  }

  validateName(name) {
    if (!String(name).trim() || String(name).length > 255) return false
    const illegal = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\u0000']
    for (const ch of illegal) { if (name.includes(ch.replace('\\u0000', '\u0000'))) return false }
    const reserved = ['CON','PRN','AUX','NUL','COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9','LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9']
    const base = path.parse(name).name.toUpperCase()
    if (reserved.includes(base)) return false
    if (name === '.' || name === '..') return false
    return true
  }

  normalizePath(p) {
    let s = String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (s) s = '/' + s
    return s
  }

  async validatePath(checkPath) {
    if (String(checkPath).includes('..')) return false
    try {
      const realPath = await fs.realpath(checkPath)
      const realBase = await fs.realpath(this.basePath)
      return realPath.startsWith(realBase)
    } catch {
      try {
        let parent = path.dirname(checkPath)
        while (parent !== path.dirname(parent) && !(await this.exists(parent))) { parent = path.dirname(parent) }
        const realParent = await fs.realpath(parent)
        const realBase = await fs.realpath(this.basePath)
        if (!realParent.startsWith(realBase)) return false
        const remaining = checkPath.slice(realParent.length)
        return !remaining.includes('..')
      } catch {
        return false
      }
    }
  }

  async exists(p) { try { await fs.access(p); return true } catch { return false } }

  successResponse(relativePath, fileName, fullPath, downloadResult) {
    return {
      success: true,
      message: '下载成功',
      data: {
        fileName,
        relativePath: this.normalizePath(path.relative(this.basePath, fullPath)),
        parentPath: relativePath,
        size: downloadResult.downloaded,
        download: downloadResult
      }
    }
  }

  errorResponse(error) { return { success: false, error, data: null } }
}

module.exports = FileUrlDownloadManager
