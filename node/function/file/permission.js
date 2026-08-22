const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { getPath } = require('../../config/paths')

class FilePermissionManager {
  constructor(wwwPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.basePath = path.resolve(this.wwwPath)
  }

  async setPermission(relativePath = '', name = '', permissions = '644', recursive = false) {
    try {
      if (!name) return this.errorResponse('文件名不能为空')
      if (!this.validatePermissions(permissions)) return this.errorResponse('权限格式无效，请使用3位数字格式（如：755, 644）')
      if (!this.validateName(name)) return this.errorResponse('文件名包含非法字符')
      const rel = this.normalizePath(relativePath)
      const fullPath = path.join(this.basePath, rel, name)
      if (!await this.validatePath(fullPath)) return this.errorResponse('访问被拒绝：路径超出允许范围')
      try { await fs.access(fullPath) } catch { return this.errorResponse('文件或文件夹不存在') }
      const oct = parseInt(permissions, 8)
      const stat = await fs.lstat(fullPath)
      const results = []
      const errors = []
      const apply = async (p, isDir) => {
        try { await fs.chmod(p, oct); results.push({ path: p, type: isDir ? 'directory' : 'file', permissions }) } catch { errors.push('权限修改失败: ' + p) }
      }
      await apply(fullPath, stat.isDirectory())
      if (stat.isDirectory() && recursive) {
        await this.setPermissionRecursive(fullPath, oct, results, errors)
      }
      if (errors.length === 0) {
        return { success: true, message: '权限修改成功', data: { modified_count: results.length, details: results } }
      }
      return { success: false, message: '部分权限修改失败', data: { modified_count: results.length, error_count: errors.length, details: results, errors } }
    } catch (e) {
      return this.errorResponse('权限修改异常: ' + e.message)
    }
  }

  async getPermission(relativePath = '', name = '') {
    try {
      if (!name) return this.errorResponse('文件名不能为空')
      if (!this.validateName(name)) return this.errorResponse('文件名包含非法字符')
      const rel = this.normalizePath(relativePath)
      const fullPath = path.join(this.basePath, rel, name)
      if (!await this.validatePath(fullPath)) return this.errorResponse('访问被拒绝：路径超出允许范围')
      try { await fs.access(fullPath) } catch { return this.errorResponse('文件或文件夹不存在') }
      const st = await fs.lstat(fullPath)
      const perms = this.formatPermissions(st.mode)
      const readable = await this.canAccess(fullPath, fsSync.constants.R_OK)
      const writable = await this.canAccess(fullPath, fsSync.constants.W_OK)
      const executable = await this.canAccess(fullPath, fsSync.constants.X_OK)
      return { success: true, data: { name, path: rel, permissions: perms, is_directory: st.isDirectory(), is_readable: readable, is_writable: writable, is_executable: executable } }
    } catch (e) {
      return this.errorResponse('获取权限信息异常: ' + e.message)
    }
  }

  async setPermissionRecursive(directory, oct, results, errors) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        const p = path.join(directory, entry.name)
        const lst = await fs.lstat(p)
        if (lst.isSymbolicLink()) continue
        try { await fs.chmod(p, oct); results.push({ path: p, type: lst.isDirectory() ? 'directory' : 'file', permissions: this.formatPermissions(oct) }) } catch { errors.push('权限修改失败: ' + p) }
        if (lst.isDirectory()) await this.setPermissionRecursive(p, oct, results, errors)
      }
    } catch (e) {
      errors.push('递归遍历异常: ' + e.message)
    }
  }

  validatePermissions(p) { return /^[0-7]{3}$/.test(String(p)) }

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

  async canAccess(p, mode) { try { await fs.access(p, mode); return true } catch { return false } }

  formatPermissions(mode) { return (mode & parseInt('777', 8)).toString(8).padStart(3, '0') }

  errorResponse(message) { return { success: false, error: message, data: null } }
}

module.exports = FilePermissionManager