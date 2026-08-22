const fs = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')

class FileCreateManager {
  constructor(wwwPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.basePath = path.resolve(this.wwwPath)
  }

  async create(relativePath = '', type = 'file', name = '', content = '') {
    try {
      if (!name) {
        return this.errorResponse('名称不能为空')
      }
      if (!['file', 'directory'].includes(type)) {
        return this.errorResponse('类型必须是 file 或 directory')
      }
      if (!this.validateName(name)) {
        return this.errorResponse('名称包含非法字符')
      }

      relativePath = this.normalizePath(relativePath)
      const targetDir = path.join(this.basePath, relativePath)

      if (!await this.validatePath(targetDir)) {
        return this.errorResponse('无效的目标路径')
      }

      try {
        const stat = await fs.stat(targetDir)
        if (!stat.isDirectory()) {
          return this.errorResponse('目标目录不存在')
        }
      } catch {
        return this.errorResponse('目标目录不存在')
      }

      const fullPath = path.join(targetDir, name)

      try {
        await fs.access(fullPath)
        return this.errorResponse('文件或文件夹已存在')
      } catch {
        // 文件或文件夹不存在，继续创建
      }

      if (!await this.validatePath(fullPath)) {
        return this.errorResponse('创建路径不安全')
      }

      if (type === 'directory') {
        await fs.mkdir(fullPath, { recursive: true, mode: 0o755 })
      } else {
        await fs.writeFile(fullPath, content || '')
        await fs.chmod(fullPath, 0o644)
      }
      const stat = await fs.stat(fullPath)
      return this.successResponse(relativePath, type, name, fullPath, stat)
    } catch (error) {
      return this.errorResponse('创建失败: ' + error.message)
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

  successResponse(relativePath, type, name, fullPath, stat) {
    return {
      success: true,
      message: (type === 'directory' ? '文件夹' : '文件') + '创建成功',
      data: {
        name,
        type,
        relativePath: this.getRelativePath(fullPath),
        parentPath: relativePath,
        created: new Date().toISOString().slice(0, 19).replace('T', ' '),
        size: type === 'file' ? stat.size : null,
        permissions: this.formatPermissions(stat.mode)
      }
    }
  }

  errorResponse(message) {
    return { success: false, error: message, data: null }
  }
}

module.exports = FileCreateManager

