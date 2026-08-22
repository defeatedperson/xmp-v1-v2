const Docker = require('dockerode')
const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')
const { taskManager } = require('../basic/task-manager')

class WebsiteBackupManager {
  constructor(options = {}) {
    this.docker = new Docker(options)
    this.logger = options.logger || console
  }

  resolveWebsiteDir(domain) {
    return getPath('data', 'www', 'openresty', 'website', domain)
  }

  resolveBackupDir(domain) {
    return getPath('data', 'www', 'backup', domain)
  }

  async ensureDir(p) {
    await fsp.mkdir(p, { recursive: true })
  }

  async exists(p) {
    try {
      await fsp.access(p)
      return true
    } catch {
      return false
    }
  }

  async countFiles(dir) {
    try {
      const stack = [dir]
      let count = 0
      while (stack.length) {
        const cur = stack.pop()
        let list
        try { list = await fsp.readdir(cur, { withFileTypes: true }) } catch { continue }
        for (const d of list) {
          const p = path.join(cur, d.name)
          if (d.isFile()) count++
          else if (d.isDirectory()) stack.push(p)
        }
      }
      return count
    } catch {
      return 0
    }
  }

  isAllowedBackupFile(name) {
    const lower = String(name || '').toLowerCase()
    if (!lower) return false
    if (lower.endsWith('.tgz')) return true
    if (lower.endsWith('.tar.gz')) return true
    if (lower.endsWith('.tar')) return true
    return false
  }

  async listBackups(domain) {
    const dir = this.resolveBackupDir(domain)
    try {
      const list = await fsp.readdir(dir, { withFileTypes: true })
      const files = []
      for (const d of list) {
        if (!d.isFile()) continue
        if (!this.isAllowedBackupFile(d.name)) continue
        try {
          const p = path.join(dir, d.name)
          const st = await fsp.stat(p)
          files.push({
            name: d.name,
            size: st.size,
            modifiedTime: st.mtime.toISOString()
          })
        } catch {}
      }
      files.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))
      return files
    } catch {
      return []
    }
  }

  async deleteBackup(domain, backupFile) {
    const dir = this.resolveBackupDir(domain)
    const full = path.join(dir, backupFile)
    try {
      await fsp.rm(full, { force: true })
      try {
        const left = await fsp.readdir(dir)
        if (!left.length) {
          await fsp.rmdir(dir).catch(() => {})
        }
      } catch {}
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  async ensureImage(image, addLog) {
    try { await this.docker.getImage(image).inspect(); return }
    catch {}
    if (addLog) addLog(`拉取镜像: ${image}`)
    const stream = await this.docker.pull(image)
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve())
    })
  }

  async archiveByTempContainer(srcDir, outDir, outFileName) {
    try { fs.mkdirSync(outDir, { recursive: true }) } catch {}
    const binds = [ `${srcDir}:/src:ro`, `${outDir}:/dst` ]
    const cmd = `tar czf "/dst/${outFileName}" -C /src .`
    const container = await this.docker.createContainer({ Image: 'alpine:latest', Cmd: ['sh', '-c', cmd], HostConfig: { Binds: binds } })
    await container.start()
    await container.wait()
    try { await container.remove({ force: true }) } catch {}
  }

  async createBackupAsync(domain, backupName = '') {
    const taskId = taskManager.createTask('website-backup', { domain, backupName })
    taskManager.executeTask(taskId, async (_id, progress, addLog) => {
      progress(5, '准备')
      const sourceDir = this.resolveWebsiteDir(domain)
      let st
      try {
        st = await fsp.stat(sourceDir)
      } catch {
        throw new Error('站点目录不存在')
      }
      if (!st.isDirectory()) throw new Error('站点路径不是目录')
      const fileCount = await this.countFiles(sourceDir)
      addLog(`源目录文件数: ${fileCount}`)
      if (fileCount <= 0) throw new Error('站点目录为空或无文件')
      const backupDir = this.resolveBackupDir(domain)
      await this.ensureDir(backupDir)
      const existing = await this.listBackups(domain)
      if (existing.length >= 30) throw new Error('已达备份上限(30)，请删除旧备份后再创建')
      const stamp = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 14)
      const base = String(backupName || '').trim() || `${domain}-${stamp}`
      let fileName = base
      const lower = fileName.toLowerCase()
      if (!(lower.endsWith('.tgz') || lower.endsWith('.tar.gz') || lower.endsWith('.tar'))) {
        fileName = fileName + '.tgz'
      }
      const outFull = path.join(backupDir, fileName)
      if (await this.exists(outFull)) throw new Error('备份文件已存在')
      await this.ensureImage('alpine:latest', addLog)
      progress(30, '准备归档')
      await this.archiveByTempContainer(sourceDir, backupDir, fileName)
      try { fs.accessSync(outFull, fs.constants.F_OK) } catch { throw new Error('归档失败') }
      progress(90, '归档完成')
      const stats = await fsp.stat(outFull)
      const result = { success: true, data: { domain, backupFile: fileName, size: stats.size, modifiedTime: stats.mtime.toISOString() } }
      taskManager.updateTask(taskId, { result })
      progress(100, '完成')
    })
    return taskId
  }
}

module.exports = WebsiteBackupManager

