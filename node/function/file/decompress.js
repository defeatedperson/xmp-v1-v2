const fsp = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { getPath } = require('../../config/paths')

class FileDecompressManager {
  constructor(wwwPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.basePath = path.resolve(this.wwwPath)
    this.allowedExtensions = ['zip', 'tar', 'tgz', 'tar.gz', 'gz']
    this.compoundExtensions = { 'tar.gz': 'tgz' }
  }

  async extractArchive(relativePath = '', archiveName = '', extractPath = '') {
    try {
      if (!archiveName) return this.errorResponse('压缩包文件名不能为空')
      if (!this.validateName(archiveName)) return this.errorResponse('压缩包文件名包含非法字符')
      const extension = this.getFileExtension(archiveName)
      if (!this.isAllowedExtension(extension)) return this.errorResponse('不支持的压缩包格式: ' + extension)

      relativePath = this.normalizePath(relativePath)

      // 禁止在 temp 目录内操作
      if (relativePath === '/temp' || relativePath.startsWith('/temp/')) {
        return this.errorResponse('无法在临时目录内进行解压')
      }

      const sourceDir = path.join(this.basePath, relativePath)
      const archivePath = path.join(sourceDir, archiveName)

      if (!await this.validatePath(archivePath)) return this.errorResponse('压缩包路径不安全')
      try {
        const stat = await fsp.stat(archivePath)
        if (!stat.isFile()) return this.errorResponse('指定路径不是文件')
      } catch { return this.errorResponse('压缩包文件不存在') }

      if (!extractPath) {
        extractPath = path.join(sourceDir, path.parse(archiveName).name)
      } else {
        if (!this.validateName(path.basename(extractPath))) {
          return this.errorResponse('解压目标路径名称包含非法字符')
        }
        extractPath = path.join(sourceDir, extractPath)
      }

      // 禁止解压为 temp 目录
      const relExtract = this.getRelativePath(extractPath)
      if (relExtract === '/temp') {
        return this.errorResponse('无法解压为临时目录')
      }

      if (!await this.validatePath(extractPath)) return this.errorResponse('解压目标路径不安全')
      if (await this.exists(extractPath)) return this.errorResponse('解压目标路径已存在')
      await fsp.mkdir(extractPath, { recursive: true, mode: 0o755 })

      const result = await this.extractByExtension(archivePath, extractPath, extension)
      if (result && result.success) {
        const extractedFiles = await this.countExtractedFiles(extractPath)
        return this.successResponse(relativePath, archiveName, extractPath, extractedFiles)
      }
      await this.removeDirectory(extractPath)
      return result || this.errorResponse('解压失败')
    } catch (e) {
      return this.errorResponse('解压失败: ' + e.message)
    }
  }

  async extractByExtension(archivePath, extractPath, extension) {
    const ext = extension.toLowerCase()
    if (ext === 'zip') return this.extractZip(archivePath, extractPath)
    if (ext === 'tar') return this.extractTar(archivePath, extractPath)
    if (ext === 'tgz' || ext === 'tar.gz') return this.extractTarGz(archivePath, extractPath)
    if (ext === 'gz') return this.extractGz(archivePath, extractPath)
    return this.errorResponse('不支持的压缩格式: ' + extension)
  }

  async extractZip(archivePath, extractPath) {
    try {
      let extract
      try {
        extract = require('extract-zip')
      } catch (e) {
        if (String(e && e.code) === 'MODULE_NOT_FOUND') {
          return this.errorResponse('缺少依赖: extract-zip')
        }
        return this.errorResponse('ZIP解压异常: ' + e.message)
      }
      await extract(archivePath, { dir: extractPath })
      const ok = await this.validateExtractedContents(extractPath)
      if (!ok) return this.errorResponse('ZIP文件包含不安全的路径')
      return { success: true }
    } catch (e) {
      return this.errorResponse('ZIP解压失败: ' + e.message)
    }
  }

  async extractTar(archivePath, extractPath) {
    try {
      let tar
      try {
        tar = require('tar')
      } catch (e) {
        if (String(e && e.code) === 'MODULE_NOT_FOUND') {
          return this.errorResponse('缺少依赖: tar')
        }
        return this.errorResponse('TAR解压异常: ' + e.message)
      }
      await tar.x({ file: archivePath, cwd: extractPath, strip: 0 })
      const ok = await this.validateExtractedContents(extractPath)
      if (!ok) return this.errorResponse('TAR文件包含不安全的路径')
      return { success: true }
    } catch (e) {
      return this.errorResponse('TAR解压失败: ' + e.message)
    }
  }

  async extractTarGz(archivePath, extractPath) {
    try {
      let tar
      try {
        tar = require('tar')
      } catch (e) {
        if (String(e && e.code) === 'MODULE_NOT_FOUND') {
          return this.errorResponse('缺少依赖: tar')
        }
        return this.errorResponse('TAR.GZ解压异常: ' + e.message)
      }
      await tar.x({ file: archivePath, cwd: extractPath, gzip: true, strip: 0 })
      const ok = await this.validateExtractedContents(extractPath)
      if (!ok) return this.errorResponse('TAR.GZ文件包含不安全的路径')
      return { success: true }
    } catch (e) {
      return this.errorResponse('TAR.GZ解压失败: ' + e.message)
    }
  }

  async extractGz(archivePath, extractPath) {
    try {
      const zlib = require('zlib')
      const outputName = path.parse(archivePath).name
      const outputPath = path.join(extractPath, outputName)
      await new Promise((resolve, reject) => {
        const inStream = fsSync.createReadStream(archivePath)
        const outStream = fsSync.createWriteStream(outputPath)
        const gunzip = zlib.createGunzip()
        inStream.on('error', reject)
        outStream.on('error', reject)
        outStream.on('finish', resolve)
        inStream.pipe(gunzip).pipe(outStream)
      })
      const ok = await this.validateExtractedContents(extractPath)
      if (!ok) return this.errorResponse('GZ文件解压结果包含不安全的路径')
      return { success: true }
    } catch (e) {
      return this.errorResponse('GZ解压失败: ' + e.message)
    }
  }

  async validateExtractedContents(root) {
    try {
      const realRoot = await fsp.realpath(root)
      const realBase = await fsp.realpath(this.basePath)
      if (!realRoot.startsWith(realBase)) return false
      const stack = [root]
      while (stack.length) {
        const dir = stack.pop()
        const entries = await fsp.readdir(dir, { withFileTypes: true })
        for (const e of entries) {
          const p = path.join(dir, e.name)
          const rp = await fsp.realpath(p).catch(() => null)
          if (!rp || !rp.startsWith(realBase)) return false
          if (e.isDirectory()) stack.push(p)
        }
      }
      return true
    } catch {
      return false
    }
  }

  getFileExtension(filename) {
    const lower = String(filename).toLowerCase()
    for (const k of Object.keys(this.compoundExtensions)) {
      if (lower.endsWith('.' + k)) return k
    }
    return path.parse(lower).ext.replace(/^\./, '')
  }

  isAllowedExtension(ext) {
    return this.allowedExtensions.includes(String(ext).toLowerCase())
  }

  async removeDirectory(dir) {
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await this.removeDirectory(p)
        } else {
          await fsp.unlink(p).catch(() => {})
        }
      }
      await fsp.rmdir(dir).catch(() => {})
    } catch {}
  }

  async exists(p) {
    try { await fsp.access(p); return true } catch { return false }
  }

  validateName(name) {
    if (!String(name).trim() || String(name).length > 255) return false
    const illegal = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\u0000']
    for (const ch of illegal) {
      if (name.includes(ch.replace('\\u0000', '\u0000'))) return false
    }
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
      const realPath = await fsp.realpath(checkPath)
      const realBase = await fsp.realpath(this.basePath)
      return realPath.startsWith(realBase)
    } catch {
      try {
        let parent = path.dirname(checkPath)
        while (parent !== path.dirname(parent) && !(await this.exists(parent))) {
          parent = path.dirname(parent)
        }
        const realParent = await fsp.realpath(parent)
        const realBase = await fsp.realpath(this.basePath)
        if (!realParent.startsWith(realBase)) return false
        const remaining = checkPath.slice(realParent.length)
        return !remaining.includes('..')
      } catch {
        return false
      }
    }
  }

  getRelativePath(fullPath) {
    const rel = path.relative(this.basePath, fullPath)
    return this.normalizePath(rel)
  }

  countExtractedFiles(p) {
    return (async () => {
      let count = 0
      const stack = [p]
      while (stack.length) {
        const dir = stack.pop()
        let entries
        try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
        for (const e of entries) {
          const fp = path.join(dir, e.name)
          if (e.isDirectory()) stack.push(fp)
          else count++
        }
      }
      return count
    })()
  }

  successResponse(relativePath, archiveName, extractPath, extractedFiles) {
    return {
      success: true,
      message: '解压成功',
      data: {
        archiveName,
        extractPath: this.getRelativePath(extractPath),
        parentPath: relativePath,
        extracted: new Date().toISOString().slice(0, 19).replace('T', ' '),
        extractedFiles
      }
    }
  }

  errorResponse(message) {
    return { success: false, error: message, data: null }
  }
}

module.exports = FileDecompressManager
