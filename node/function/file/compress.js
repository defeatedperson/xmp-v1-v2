const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { getPath } = require('../../config/paths')

class FileCompressManager {
  constructor(wwwPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.basePath = path.resolve(this.wwwPath)
  }

  async createArchive(relativePath = '', sourceName = '', archiveName = '') {
    try {
      if (!sourceName) return this.errorResponse('源文件或文件夹名称不能为空')
      if (!this.validateName(sourceName)) return this.errorResponse('源文件名包含非法字符')

      relativePath = this.normalizePath(relativePath)

      // 禁止压缩 temp 目录本身
      if ((relativePath === '' || relativePath === '/') && sourceName === 'temp') {
        return this.errorResponse('无法压缩临时目录')
      }

      const targetDir = path.join(this.basePath, relativePath)

      if (!await this.validatePath(targetDir)) return this.errorResponse('无效的目标路径')
      try {
        const stat = await fs.stat(targetDir)
        if (!stat.isDirectory()) return this.errorResponse('目标目录不存在')
      } catch { return this.errorResponse('目标目录不存在') }

      const sourcePath = path.join(targetDir, sourceName)
      try { await fs.access(sourcePath) } catch { return this.errorResponse('源文件或文件夹不存在') }
      if (!await this.validatePath(sourcePath)) return this.errorResponse('源文件路径不安全')

      const statSource = await fs.stat(sourcePath)
      if (statSource.isDirectory()) {
        const empty = await this.isEmptyDirectory(sourcePath)
        if (empty) return this.errorResponse('无法压缩空文件夹')
      }

      if (!archiveName) {
        archiveName = sourceName + '.zip'
      } else {
        const ext = path.parse(archiveName).ext.toLowerCase()
        if (ext !== '.zip') archiveName = archiveName + '.zip'
      }

      if (!this.validateName(archiveName)) return this.errorResponse('压缩包名称包含非法字符')
      const archivePath = path.join(targetDir, archiveName)
      if (await this.exists(archivePath)) return this.errorResponse('压缩包已存在')
      if (!await this.validatePath(archivePath)) return this.errorResponse('压缩包路径不安全')

      let archiver
      try { archiver = require('archiver') } catch (e) {
        if (String(e && e.code) === 'MODULE_NOT_FOUND') return this.errorResponse('缺少依赖: archiver')
        return this.errorResponse('创建压缩包异常: ' + e.message)
      }

      await new Promise((resolve, reject) => {
        const output = fsSync.createWriteStream(archivePath)
        const archive = archiver('zip', { zlib: { level: 9 } })
        output.on('close', resolve)
        output.on('error', reject)
        archive.on('error', reject)
        archive.pipe(output)
        if (statSource.isDirectory()) {
          archive.directory(sourcePath, false)
        } else {
          archive.file(sourcePath, { name: path.basename(sourcePath) })
        }
        archive.finalize()
      })

      const statArchive = await fs.stat(archivePath)
      return this.successResponse(relativePath, sourceName, archiveName, archivePath, statArchive)
    } catch (e) {
      return this.errorResponse('创建压缩包失败: ' + e.message)
    }
  }

  async isEmptyDirectory(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      for (const e of entries) {
        if (e.name === '.' || e.name === '..') continue
        const p = path.join(dirPath, e.name)
        if (e.isFile()) return false
        if (e.isDirectory()) {
          const notEmpty = !(await this.isEmptyDirectory(p))
          if (notEmpty) return false
        }
      }
      return true
    } catch {
      return false
    }
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
    if (name.startsWith('.') || name.endsWith('.')) {
      if (/^\.+$/.test(name)) return false
    }
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
        while (parent !== path.dirname(parent) && !(await this.exists(parent))) {
          parent = path.dirname(parent)
        }
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

  async exists(p) {
    try { await fs.access(p); return true } catch { return false }
  }

  getRelativePath(fullPath) {
    const rel = path.relative(this.basePath, fullPath)
    return this.normalizePath(rel)
  }

  formatPermissions(mode) {
    return (mode & parseInt('777', 8)).toString(8).padStart(3, '0')
  }

  successResponse(relativePath, sourceName, archiveName, archivePath, stat) {
    return {
      success: true,
      message: '压缩包创建成功',
      data: {
        sourceName,
        archiveName,
        relativePath: this.getRelativePath(archivePath),
        parentPath: relativePath,
        created: new Date().toISOString().slice(0, 19).replace('T', ' '),
        size: stat.size,
        permissions: this.formatPermissions(stat.mode)
      }
    }
  }

  errorResponse(message) {
    return { success: false, error: message, data: null }
  }
}

module.exports = FileCompressManager
