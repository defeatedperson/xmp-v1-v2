const Docker = require('dockerode')
const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')
const { taskManager } = require('../basic/task-manager')

class ContainerBackupManager {
  constructor(options = {}) {
    this.docker = new Docker(options)
    this.logger = options.logger || console
  }

  async getContainerInfo(containerId) {
    const c = this.docker.getContainer(containerId)
    const info = await c.inspect()
    return info
  }

  buildManifest(info) {
    const name = String(info.Name || '').replace(/^\//, '')
    const ports = {}
    const binds = {}
    const mounts = Array.isArray(info.Mounts) ? info.Mounts : []
    const hasDockerVolume = mounts.some(m => m && m.Type === 'volume')
    const portBindings = info.HostConfig && info.HostConfig.PortBindings ? info.HostConfig.PortBindings : {}
    Object.keys(portBindings).forEach(k => {
      const arr = portBindings[k]
      if (Array.isArray(arr) && arr[0] && arr[0].HostPort) {
        const containerPort = String(k).replace('/tcp','').replace('/udp','')
        ports[containerPort] = parseInt(arr[0].HostPort)
      }
    })
    mounts.forEach(m => {
      if (m && m.Type === 'bind' && m.Source && m.Destination) {
        binds[m.Destination] = m.Source
      }
    })
    const env = Array.isArray(info.Config && info.Config.Env) ? info.Config.Env : []
    const manifest = {
      name,
      image: info.Config && info.Config.Image ? info.Config.Image : '',
      cmd: Array.isArray(info.Config && info.Config.Cmd) ? info.Config.Cmd : [],
      env,
      ports,
      volumes: binds,
      hasDockerVolume,
      networkMode: info.HostConfig && info.HostConfig.NetworkMode ? info.HostConfig.NetworkMode : '',
      networks: Object.keys(info.NetworkSettings && info.NetworkSettings.Networks || {}),
      createdAt: info.Created || ''
    }
    return manifest
  }

  resolveBackupDir(name, backupName) {
    const dir = getPath('data','www','backup', name, backupName)
    return dir
  }

  async ensureDir(p) {
    await fsp.mkdir(p, { recursive: true })
  }

  async writeJSON(filePath, obj) {
    const s = JSON.stringify(obj)
    await fsp.writeFile(filePath, s)
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

  async listBackups(name) {
    const dir = getPath('data','www','backup', name)
    try {
      const list = await fsp.readdir(dir, { withFileTypes: true })
      return list.filter(d => d.isDirectory()).map(d => d.name)
    } catch {
      return []
    }
  }

  async deleteBackup(name, backupName) {
    const dir = this.resolveBackupDir(name, backupName)
    try {
      await fsp.rm(dir, { recursive: true, force: true })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  async createBackupAsync(containerId, backupName, options = {}) {
    const taskId = taskManager.createTask('container-backup', { containerId, backupName, options })
    taskManager.executeTask(taskId, async (_id, progress, addLog) => {
      progress(5, '准备')
      const info = await this.getContainerInfo(containerId)
      const name = String(info.Name || '').replace(/^\//, '')
      const existing = await this.listBackups(name)
      if (existing.length >= 30) {
        throw new Error('已达备份上限(30)，请删除旧备份后再创建')
      }
      const stamp = new Date().toISOString().replace(/[-:TZ]/g,'').slice(0,14)
      const bn = String(backupName || '').trim() || `${name}-${stamp}`
      const dir = this.resolveBackupDir(name, bn)
      await this.ensureDir(dir)
      addLog('生成配置')
      const manifest = this.buildManifest(info)
      await this.writeJSON(path.join(dir, 'manifest.json'), manifest)
      progress(30, '写入配置')
      const baseDir = getPath('data','www', name)
      const fileCount = await this.countFiles(baseDir)
      addLog(`源目录文件数: ${fileCount}`)
      if (fileCount <= 0) {
        throw new Error('备份源目录为空或无文件，可能使用Docker volume或挂载错误')
      }
      addLog('准备数据归档')
      await this.ensureImage('alpine:latest', addLog)
      progress(40, '拉取工具镜像')
      const srcDir = getPath('data','www', name)
      const dataFile = path.join(dir, 'data.tgz')
      await this.archiveByTempContainer(srcDir, dataFile, addLog)
      progress(80, '归档完成')
      const hash = await this.sha256File(dataFile)
      await this.writeJSON(path.join(dir, 'checksums.json'), { 'data.tgz': hash })
      addLog('完成')
      progress(100, '完成')
      taskManager.updateTask(taskId, { result: { success: true, data: { name, backupName: bn, dir } } })
    })
    return taskId
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

  async archiveByTempContainer(srcDir, outFile, _addLog) {
    const outDir = path.dirname(outFile)
    try { fs.mkdirSync(outDir, { recursive: true }) } catch {}
    const binds = [ `${srcDir}:/src:ro`, `${outDir}:/dst` ]
    const container = await this.docker.createContainer({ Image: 'alpine:latest', Cmd: ['sh','-c', 'tar czf /dst/data.tgz -C /src .'], HostConfig: { Binds: binds } })
    await container.start()
    await container.wait()
    try { await container.remove({ force: true }) } catch {}
    try { fs.accessSync(outFile, fs.constants.F_OK) } catch { throw new Error('归档失败') }
  }

  async sha256File(filePath) {
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    return await new Promise((resolve, reject) => {
      stream.on('data', (d) => hash.update(d))
      stream.on('error', reject)
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  }
}

module.exports = ContainerBackupManager
