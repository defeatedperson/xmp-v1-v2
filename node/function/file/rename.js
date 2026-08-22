const fs = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')

class FileRenameManager {
  constructor(wwwPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.basePath = path.resolve(this.wwwPath)
  }

  async rename(relativePath = '', type = 'file', oldName = '', newName = '') {
    try {
      if (!oldName) return this.errorResponse('原名称不能为空')
      if (!newName) return this.errorResponse('新名称不能为空')
      if (oldName === newName) return this.errorResponse('新名称不能与原名称相同')
      if (!['file', 'directory'].includes(type)) {
        return this.errorResponse('类型必须是 file 或 directory')
      }
      if (!this.validateName(oldName)) return this.errorResponse('原名称包含非法字符')
      if (!this.validateName(newName)) return this.errorResponse('新名称包含非法字符')

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

      const oldFullPath = path.join(targetDir, oldName)
      const newFullPath = path.join(targetDir, newName)

      try { await fs.access(oldFullPath) } catch { return this.errorResponse('文件或文件夹不存在') }
      try { await fs.access(newFullPath); return this.errorResponse('同名文件或文件夹已存在') } catch {}

      if (!await this.validatePath(oldFullPath) || !await this.validatePath(newFullPath)) {
        return this.errorResponse('重命名路径不安全')
      }

      let result
      if (type === 'directory') {
        result = await this.renameDirectory(oldFullPath, newFullPath)
      } else {
        result = await this.renameFile(oldFullPath, newFullPath)
      }

      if (result && result.success) {
        return this.successResponse(relativePath, type, oldName, newName, newFullPath)
      }
      return result || this.errorResponse('重命名失败')
    } catch (error) {
      return this.errorResponse('重命名失败: ' + error.message)
    }
  }

  async renameDirectory(oldFullPath, newFullPath) {
    try {
      const stat = await fs.stat(oldFullPath)
      if (!stat.isDirectory()) {
        return this.errorResponse('指定路径不是目录')
      }
      await fs.rename(oldFullPath, newFullPath)
      return { success: true }
    } catch (e) {
      return this.errorResponse('重命名文件夹异常: ' + e.message)
    }
  }

  async renameFile(oldFullPath, newFullPath) {
    try {
      const stat = await fs.stat(oldFullPath)
      if (!stat.isFile()) {
        return this.errorResponse('指定路径不是文件')
      }
      await fs.rename(oldFullPath, newFullPath)
      return { success: true }
    } catch (e) {
      return this.errorResponse('重命名文件异常: ' + e.message)
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

  successResponse(relativePath, type, oldName, newName, newFullPath) {
    return {
      success: true,
      message: (type === 'directory' ? '文件夹' : '文件') + '重命名成功',
      data: {
        oldName,
        newName,
        type,
        relativePath: this.getRelativePath(newFullPath),
        parentPath: relativePath,
        renamed: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    }
  }

  errorResponse(message) {
    return { success: false, error: message, data: null }
  }
}

module.exports = FileRenameManager

