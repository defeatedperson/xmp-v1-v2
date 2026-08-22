const Docker = require('dockerode')
const fsp = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')
const { taskManager } = require('../basic/task-manager')

class ContainerRestoreManager {
  constructor(options = {}) {
    this.docker = new Docker(options)
    this.logger = options.logger || console
  }

  async readJSON(filePath) {
    const s = await fsp.readFile(filePath, 'utf8')
    return JSON.parse(s)
  }

  async findContainerByName(name) {
    const list = await this.docker.listContainers({ all: true })
    const n = String(name || '').trim()
    const hit = list.find(c => Array.isArray(c.Names) && c.Names.some(x => String(x || '').replace(/^\//,'') === n))
    return hit || null
  }

  async precheck(manifest) {
    const name = String(manifest && manifest.name || '').trim()
    if (!name) return { success: false, error: '缺少名称' }
    const hit = await this.findContainerByName(name)
    if (hit) return { success: false, error: '容器名称冲突' }
    const ports = manifest && manifest.ports ? manifest.ports : {}
    const ipBind = '0.0.0.0'
    const busy = []
    for (const k of Object.keys(ports)) {
      const hp = Number(ports[k])
      if (!Number.isNaN(hp)) {
        const net = require('net')
        const s = new net.Server()
        await new Promise(r => {
          s.once('error', err => { if (err && err.code === 'EADDRINUSE') busy.push(hp); r() })
          s.listen(hp, ipBind, () => { s.close(() => r()) })
        })
      }
    }
    if (busy.length) return { success: false, error: `端口占用: ${busy.join(',')}` }
    return { success: true }
  }

  async restoreBackupAsync(name, backupName, options = {}) {
    const taskId = taskManager.createTask('container-restore', { name, backupName, options })
    taskManager.executeTask(taskId, async (_id, progress, addLog) => {
      progress(5, '准备')
      const useImport = options && options.importDir
      const dir = useImport ? getPath('data','www','backup','import', String(backupName || '').trim()) : getPath('data','www','backup', String(name || '').trim(), String(backupName || '').trim())
      const mf = path.join(dir, 'manifest.json')
      addLog('读取配置')
      let manifest
      try { manifest = await this.readJSON(mf) } catch { throw new Error('读取配置失败') }
      const manifestName = String(manifest && manifest.name || '').trim()
      if (!manifestName) { throw new Error('备份记录缺少容器名称') }
      const restoreName = (options && options.importDir) ? manifestName : name
      if (!(options && options.dataOnly) && restoreName !== manifestName) { throw new Error('容器名称与备份记录不一致') }
      const managedBase = getPath('data','www', restoreName)
      if (manifest && manifest.hasDockerVolume) {
        throw new Error('不支持Docker volume')
      }
      const vols = manifest && manifest.volumes ? manifest.volumes : {}
      for (const containerPath of Object.keys(vols)) {
        const sourcePath = vols[containerPath]
        if (!sourcePath) continue
        const srcAbs = path.resolve(String(sourcePath))
        const baseAbs = path.resolve(managedBase)
        if (!srcAbs.startsWith(baseAbs)) {
          throw new Error('卷路径不在受管目录(data/www/<name>)')
        }
      }
      progress(20, '校验')
      if (options && options.dataOnly) {
        const exists = await this.findContainerByName(restoreName)
        if (exists && options.restart) {
          const c = this.docker.getContainer(exists.Id)
          try { await c.stop({ t: 10 }) } catch {}
        }
        await this.ensureImage('alpine:latest', addLog)
        const srcDir = dir
        const outDir = getPath('data','www', restoreName)
        await this.extractByTempContainer(path.join(srcDir, 'data.tgz'), outDir, addLog)
        if (exists && options.restart) {
          const c = this.docker.getContainer(exists.Id)
          try { await c.start() } catch {}
        }
        addLog('数据恢复完成')
        progress(100, '完成')
        taskManager.updateTask(taskId, { result: { success: true, data: { name: restoreName, backupName, dir } } })
        return
      }
      const strict = true
      if (strict) {
        const ok = await this.precheck({ name: restoreName, ports: manifest.ports })
        if (!ok.success) throw new Error(ok.error || '校验失败')
      } else {
        const hit = await this.findContainerByName(restoreName)
        if (hit) {
          const c = this.docker.getContainer(hit.Id)
          try { await c.stop({ t: 10 }) } catch {}
          try { await c.remove({ force: true }) } catch {}
        }
      }
      await this.ensureImage('alpine:latest', addLog)
      const srcDir = dir
      const outDir = getPath('data','www', restoreName)
      await this.extractByTempContainer(path.join(srcDir, 'data.tgz'), outDir, addLog)
      progress(60, '数据解包完成')
      await this.ensureImage(manifest.image, addLog)
      await this.createContainerFromManifest(restoreName, manifest, addLog)
      addLog('容器创建完成')
      progress(100, '完成')
      addLog('完成')
      progress(100, '完成')
      taskManager.updateTask(taskId, { result: { success: true, data: { name: restoreName, backupName, dir } } })
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

  async extractByTempContainer(archiveFile, outDir, _addLog) {
    const fs = require('fs')
    try { fs.mkdirSync(outDir, { recursive: true }) } catch {}
    const binds = [ `${path.dirname(archiveFile)}:/src:ro`, `${outDir}:/dst` ]
    const container = await this.docker.createContainer({ Image: 'alpine:latest', Cmd: ['sh','-c', 'tar xzf /src/data.tgz -C /dst'], HostConfig: { Binds: binds } })
    await container.start()
    await container.wait()
    try { await container.remove({ force: true }) } catch {}
  }

  async createContainerFromManifest(name, manifest, _addLog) {
    const env = Array.isArray(manifest.env) ? manifest.env : []
    const ports = manifest.ports || {}
    const volumes = manifest.volumes || {}
    const HostConfig = { Binds: [], PortBindings: {}, NetworkMode: manifest.networkMode || undefined, RestartPolicy: { Name: 'unless-stopped' } }
    Object.keys(ports).forEach(cp => {
      const hostPort = Number(ports[cp])
      if (!Number.isNaN(hostPort)) {
        const key = cp.toString().includes('/') ? cp.toString() : `${cp}/tcp`
        HostConfig.PortBindings[key] = [{ HostPort: String(hostPort) }]
      }
    })
    const managedBase = getPath('data','www', name)
    Object.keys(volumes).forEach(containerPath => {
      const sourcePath = volumes[containerPath]
      if (!sourcePath) return
      const srcAbs = path.resolve(String(sourcePath))
      const baseAbs = path.resolve(managedBase)
      if (!srcAbs.startsWith(baseAbs)) {
        throw new Error('卷路径不在受管目录(data/www/<name>)')
      }
      const hp = srcAbs
      HostConfig.Binds.push(`${hp}:${containerPath}`)
      try { require('fs').mkdirSync(hp, { recursive: true }) } catch {}
    })
    const Config = { Image: manifest.image, Env: env, Cmd: Array.isArray(manifest.cmd) ? manifest.cmd : undefined, HostConfig }
    const container = await this.docker.createContainer({ name, ...Config })
    await container.start()
  }
}

module.exports = ContainerRestoreManager
