const fs = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')

class FileMoveCopyManager {
  constructor(wwwPath = null) {
    this.wwwPath = wwwPath || getPath('data', 'www')
    this.basePath = path.resolve(this.wwwPath)
  }

  async move(sourceRelativePath = '', destRelativePath = '', newName = null) {
    try {
      if (!sourceRelativePath) return this.errorResponse('源路径不能为空')
      if (!destRelativePath) return this.errorResponse('目标路径不能为空')

      const srcRel = this.normalizePath(sourceRelativePath)
      const dstRel = this.normalizePath(destRelativePath)
      const sourceFullPath = path.join(this.basePath, srcRel)
      const destFullPath = path.join(this.basePath, dstRel)

      if (!await this.validatePath(sourceFullPath) || !await this.validatePath(destFullPath)) {
        return this.errorResponse('无效的路径')
      }

      try { await fs.access(sourceFullPath) } catch { return this.errorResponse('源文件或文件夹不存在') }

      const destDir = await this.ensureDestDir(destFullPath)
      if (!destDir.ok) return this.errorResponse(destDir.error)

      let finalDestPath = destFullPath
      try {
        const stat = await fs.stat(destFullPath)
        if (stat.isDirectory()) {
          const name = newName ? newName : path.basename(sourceFullPath)
          if (!this.validateName(name)) return this.errorResponse('新名称包含非法字符')
          finalDestPath = path.join(destFullPath, name)
        }
      } catch {
        if (newName) {
          if (!this.validateName(newName)) return this.errorResponse('新名称包含非法字符')
          finalDestPath = path.join(path.dirname(destFullPath), newName)
        }
      }

      if (!await this.validatePath(finalDestPath)) return this.errorResponse('目标路径不安全')
      if (await this.exists(finalDestPath)) return this.errorResponse('目标文件或文件夹已存在')

      await fs.rename(sourceFullPath, finalDestPath)
      return this.successResponse('move', srcRel, dstRel, finalDestPath)
    } catch (e) {
      return this.errorResponse('移动失败: ' + e.message)
    }
  }

  async copy(sourceRelativePath = '', destRelativePath = '', newName = null) {
    try {
      if (!sourceRelativePath) return this.errorResponse('源路径不能为空')
      if (!destRelativePath) return this.errorResponse('目标路径不能为空')

      const srcRel = this.normalizePath(sourceRelativePath)
      const dstRel = this.normalizePath(destRelativePath)
      const sourceFullPath = path.join(this.basePath, srcRel)
      const destFullPath = path.join(this.basePath, dstRel)

      if (!await this.validatePath(sourceFullPath) || !await this.validatePath(destFullPath)) {
        return this.errorResponse('无效的路径')
      }

      try { await fs.access(sourceFullPath) } catch { return this.errorResponse('源文件或文件夹不存在') }

      const destDir = await this.ensureDestDir(destFullPath)
      if (!destDir.ok) return this.errorResponse(destDir.error)

      let finalDestPath = destFullPath
      let isSourceDir = false
      const srcStat = await fs.stat(sourceFullPath)
      isSourceDir = srcStat.isDirectory()
      try {
        const dstat = await fs.stat(destFullPath)
        if (dstat.isDirectory()) {
          const name = newName ? newName : path.basename(sourceFullPath)
          if (!this.validateName(name)) return this.errorResponse('新名称包含非法字符')
          finalDestPath = path.join(destFullPath, name)
        }
      } catch {
        if (newName) {
          if (!this.validateName(newName)) return this.errorResponse('新名称包含非法字符')
          finalDestPath = path.join(path.dirname(destFullPath), newName)
        }
      }

      if (!await this.validatePath(finalDestPath)) return this.errorResponse('目标路径不安全')
      if (await this.exists(finalDestPath)) return this.errorResponse('目标文件或文件夹已存在')

      if (isSourceDir) {
        const sSep = path.join(sourceFullPath, path.sep)
        const dSep = path.join(finalDestPath, path.sep)
        if (dSep.startsWith(sSep)) return this.errorResponse('不能将文件夹复制到自身内部')
        const ok = await this.copyDirectory(sourceFullPath, finalDestPath)
        if (!ok) return this.errorResponse('复制操作失败')
      } else {
        await fs.copyFile(sourceFullPath, finalDestPath)
        try { await fs.chmod(finalDestPath, (await fs.stat(sourceFullPath)).mode) } catch {}
      }

      return this.successResponse('copy', srcRel, dstRel, finalDestPath)
    } catch (e) {
      return this.errorResponse('复制失败: ' + e.message)
    }
  }

  async copyDirectory(source, dest) {
    try {
      await fs.mkdir(dest, { recursive: true, mode: 0o755 })
      const entries = await fs.readdir(source, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue
        const srcPath = path.join(source, entry.name)
        const dstPath = path.join(dest, entry.name)
        if (entry.isDirectory()) {
          const ok = await this.copyDirectory(srcPath, dstPath)
          if (!ok) return false
        } else {
          await fs.copyFile(srcPath, dstPath)
          try { await fs.chmod(dstPath, (await fs.stat(srcPath)).mode) } catch {}
        }
      }
      return true
    } catch {
      return false
    }
  }

  async ensureDestDir(destFullPath) {
    try {
      const stat = await fs.stat(destFullPath).catch(() => null)
      const targetDir = stat && stat.isDirectory() ? destFullPath : path.dirname(destFullPath)
      await fs.mkdir(targetDir, { recursive: true, mode: 0o755 })
      return { ok: true }
    } catch {
      return { ok: false, error: '创建目标目录失败' }
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
    if (name.startsWith('.') || name.endsWith('.')) { if (/^\.+$/.test(name)) return false }
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

  getRelativePath(fullPath) {
    const rel = path.relative(this.basePath, fullPath)
    return this.normalizePath(rel)
  }

  successResponse(operation, sourceRelativePath, destRelativePath, finalDestPath) {
    return {
      success: true,
      message: operation === 'move' ? '移动成功' : '复制成功',
      data: {
        operation,
        sourcePath: sourceRelativePath,
        destPath: destRelativePath,
        finalPath: this.getRelativePath(finalDestPath),
        completed: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    }
  }

  errorResponse(message) { return { success: false, error: message, data: null } }
}

module.exports = FileMoveCopyManager