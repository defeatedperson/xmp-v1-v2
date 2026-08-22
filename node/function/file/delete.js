const fs = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')
const { createForceDeleteTask } = require('../docker/core/force-deleter')
const { dockerManager } = require('../docker')

class FileDeleteManager {
  constructor(wwwPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.basePath = path.resolve(this.wwwPath)
  }

  async delete(relativePath = '', type = 'file', name = '', force = false) {
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
      } catch {
        return this.errorResponse('文件或文件夹不存在')
      }

      if (!await this.validatePath(fullPath)) {
        return this.errorResponse('删除路径不安全')
      }

      // 如果开启了强制删除模式
      if (force === true || force === 'true') {
        const taskId = await createForceDeleteTask(dockerManager.docker, fullPath, type)
        return {
          success: true,
          message: '强制删除任务已创建',
          taskId: taskId,
          data: {
            name,
            type,
            relativePath: this.getRelativePath(fullPath),
            parentPath: relativePath
          }
        }
      }

      let result
      if (type === 'directory') {
        result = await this.deleteDirectory(fullPath)
      } else {
        result = await this.deleteFile(fullPath)
      }

      if (result && result.success) {
        return this.successResponse(relativePath, type, name, fullPath)
      }
      return result || this.errorResponse('删除失败')
    } catch (error) {
      return this.errorResponse('删除失败: ' + error.message)
    }
  }

  async deleteDirectory(fullPath) {
    try {
      const stat = await fs.stat(fullPath)
      if (!stat.isDirectory()) {
        return this.errorResponse('指定路径不是目录')
      }
      const ok = await this.recursiveRemoveDirectory(fullPath)
      if (ok) return { success: true }
      return this.errorResponse('删除文件夹失败')
    } catch (e) {
      return this.errorResponse('删除文件夹异常: ' + e.message)
    }
  }

  async deleteFile(fullPath) {
    try {
      const stat = await fs.stat(fullPath)
      if (!stat.isFile()) {
        return this.errorResponse('指定路径不是文件')
      }
      await fs.unlink(fullPath)
      return { success: true }
    } catch (e) {
      return this.errorResponse('删除文件异常: ' + e.message)
    }
  }

  async recursiveRemoveDirectory(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const ok = await this.recursiveRemoveDirectory(p)
          if (!ok) return false
        } else {
          await fs.unlink(p)
        }
      }
      await fs.rmdir(dir)
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

  successResponse(relativePath, type, name, fullPath) {
    return {
      success: true,
      message: (type === 'directory' ? '文件夹' : '文件') + '删除成功',
      data: {
        name,
        type,
        relativePath: this.getRelativePath(fullPath),
        parentPath: relativePath,
        deleted: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    }
  }

  errorResponse(message) {
    return { success: false, error: message, data: null }
  }
}

module.exports = FileDeleteManager

