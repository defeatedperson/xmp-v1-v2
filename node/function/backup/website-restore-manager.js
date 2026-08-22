const Docker = require('dockerode')
const fsp = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')
const { taskManager } = require('../basic/task-manager')

class WebsiteRestoreManager {
  constructor(options = {}) {
    this.docker = new Docker(options)
    this.logger = options.logger || console
  }

  resolveWebsiteDir(domain) {
    return getPath('data', 'www', 'openresty', 'website', domain)
  }

  resolveBackupFile(domain, backupFile) {
    return getPath('data', 'www', 'backup', domain, backupFile)
  }

  resolveTempDir(domain, taskId) {
    return getPath('data', 'www', 'temp', 'website-restore', domain, taskId)
  }

  isTgz(name) {
    const lower = String(name || '').toLowerCase()
    return lower.endsWith('.tgz') || lower.endsWith('.tar.gz')
  }

  isTar(name) {
    const lower = String(name || '').toLowerCase()
    return lower.endsWith('.tar')
  }

  async ensureDir(p) {
    await fsp.mkdir(p, { recursive: true })
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

  async restoreBackupAsync(domain, backupFile) {
    const taskId = taskManager.createTask('website-restore', { domain, backupFile })
    taskManager.executeTask(taskId, async (_id, progress, addLog) => {
      progress(5, '准备')
      const archivePath = this.resolveBackupFile(domain, backupFile)
      let st
      try {
        st = await fsp.stat(archivePath)
      } catch {
        throw new Error('备份文件不存在')
      }
      if (!st.isFile()) throw new Error('备份路径不是文件')
      if (!(this.isTgz(backupFile) || this.isTar(backupFile))) throw new Error('不支持的备份格式')
      const siteDir = this.resolveWebsiteDir(domain)
      await this.ensureDir(siteDir)
      const tempDir = this.resolveTempDir(domain, taskId)
      await this.ensureDir(tempDir)
      await this.ensureImage('alpine:latest', addLog)
      progress(30, '解压校验')
      const archiveDir = path.dirname(archivePath)
      const binds = [ `${archiveDir}:/src:ro`, `${siteDir}:/dst`, `${tempDir}:/work` ]
      const extract = this.isTar(backupFile) ? `tar xf "/src/${backupFile}" -C /work` : `tar xzf "/src/${backupFile}" -C /work`
      const cmd = [
        'sh',
        '-c',
        [
          'set -e',
          'rm -rf /work/* /work/.[!.]* /work/..?* 2>/dev/null || true',
          extract,
          'rm -rf /dst/* /dst/.[!.]* /dst/..?* 2>/dev/null || true',
          'cp -a /work/. /dst/'
        ].join('; ')
      ]
      const container = await this.docker.createContainer({ Image: 'alpine:latest', Cmd: cmd, HostConfig: { Binds: binds } })
      try {
        await container.start()
        await container.wait()
      } finally {
        try { await container.remove({ force: true }) } catch {}
        try { await fsp.rm(tempDir, { recursive: true, force: true }) } catch {}
      }
      progress(100, '完成')
      taskManager.updateTask(taskId, { result: { success: true, data: { domain, backupFile } } })
    })
    return taskId
  }
}

module.exports = WebsiteRestoreManager

