const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { getPath } = require('../../config/paths')

class FileUploadManager {
  constructor(wwwPath = null, tempPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.tempPath = tempPath || getPath('data', 'www', 'temp')
    this.basePath = path.resolve(this.wwwPath)
    this.tempBase = path.resolve(this.tempPath)
  }

  async checkFile(fileName, relativePath = '') {
    try {
      if (!this.validateName(fileName)) {
        return this.errorResponse('文件名包含非法字符')
      }
      const rel = this.normalizePath(relativePath)
      const fullPath = path.join(this.basePath, rel, fileName)
      if (!await this.validatePath(fullPath)) {
        return this.errorResponse('路径不安全')
      }
      const exists = await this.exists(fullPath)
      return this.successResponse('检查完成', { exists, fileName, path: rel })
    } catch (e) {
      return this.errorResponse('检查失败: ' + e.message)
    }
  }

  async uploadChunk(chunkPath, fileName, fileHash, chunkIndex, totalChunks, relativePath = '') {
    try {
      if (!fileName || !fileHash) {
        return this.errorResponse('文件名和文件hash不能为空')
      }
      if (!this.validateName(fileName)) {
        return this.errorResponse('文件名包含非法字符')
      }
      const tempDir = path.join(this.tempBase, fileHash)
      await fs.mkdir(tempDir, { recursive: true, mode: 0o755 })
      if (Number(chunkIndex) === 0) {
        const files = await fs.readdir(tempDir).catch(() => [])
        for (const f of files) {
          if (f.startsWith('chunk_')) {
            await fs.unlink(path.join(tempDir, f)).catch(() => {})
          }
        }
      }
      const expectedPath = path.join(tempDir, 'chunk_' + Number(chunkIndex))
      if (chunkPath && chunkPath !== expectedPath) {
        await fs.rename(chunkPath, expectedPath).catch(async () => {
          const data = await fs.readFile(chunkPath)
          await fs.writeFile(expectedPath, data)
          await fs.unlink(chunkPath).catch(() => {})
        })
      } else {
        const exists = await this.exists(expectedPath)
        if (!exists) {
          return this.errorResponse('分片保存失败')
        }
      }
      return this.successResponse('分片上传成功', { chunkIndex: Number(chunkIndex), totalChunks: Number(totalChunks), fileName })
    } catch (e) {
      return this.errorResponse('分片上传失败: ' + e.message)
    }
  }

  async mergeChunks(fileName, fileHash, totalChunks, relativePath = '') {
    try {
      if (!fileName || !fileHash) {
        return this.errorResponse('文件名和文件hash不能为空')
      }
      if (!this.validateName(fileName)) {
        return this.errorResponse('文件名包含非法字符')
      }
      const tempDir = path.join(this.tempBase, fileHash)
      for (let i = 0; i < Number(totalChunks); i++) {
        const p = path.join(tempDir, 'chunk_' + i)
        if (!fsSync.existsSync(p)) {
          return this.errorResponse('分片 ' + i + ' 不存在')
        }
      }
      const rel = this.normalizePath(relativePath)
      const targetDir = path.join(this.basePath, rel)
      await fs.mkdir(targetDir, { recursive: true, mode: 0o755 })
      const targetPath = path.join(targetDir, fileName)
      if (!await this.validatePath(targetPath)) {
        return this.errorResponse('路径不安全')
      }
      await new Promise((resolve, reject) => {
        const out = fsSync.createWriteStream(targetPath)
        out.on('error', reject)
        out.on('close', resolve)
        let idx = 0
        const appendNext = () => {
          if (idx >= Number(totalChunks)) { out.end(); return }
          const chunkFile = path.join(tempDir, 'chunk_' + idx)
          const inp = fsSync.createReadStream(chunkFile)
          inp.on('error', reject)
          inp.on('end', () => { idx++; appendNext() })
          inp.pipe(out, { end: false })
        }
        appendNext()
      })
      for (let i = 0; i < Number(totalChunks); i++) {
        const p = path.join(tempDir, 'chunk_' + i)
        try { await fs.unlink(p) } catch {}
      }
      try { await fs.rmdir(tempDir) } catch {}
      const stat = await fs.stat(targetPath)
      return this.successResponse('文件合并成功', { fileName, path: targetPath, size: stat.size })
    } catch (e) {
      return { success: false, error: '文件合并失败: ' + e.message, data: [] }
    }
  }

  validateName(name) {
    if (!String(name).trim() || String(name).length > 255) return false
    const illegal = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\u0000']
    for (const ch of illegal) { if (name.includes(ch.replace('\\u0000', '\u0000'))) return false }
    if (name === '.' || name === '..' || name.includes('..')) return false
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
      const realPath = await fs.realpath(checkPath).catch(() => null)
      const realBase = await fs.realpath(this.basePath)
      if (realPath) return realPath.startsWith(realBase)
      let parent = path.dirname(checkPath)
      while (parent !== path.dirname(parent) && !(await this.exists(parent))) { parent = path.dirname(parent) }
      const realParent = await fs.realpath(parent)
      if (!realParent.startsWith(realBase)) return false
      const remaining = checkPath.slice(realParent.length)
      return !remaining.includes('..')
    } catch {
      return false
    }
  }

  async exists(p) { try { await fs.access(p); return true } catch { return false } }

  successResponse(message, data = []) { return { success: true, message, data } }
  errorResponse(message) { return { success: false, error: message, data: [] } }
}

module.exports = FileUploadManager
