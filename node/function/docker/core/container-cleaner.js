const fs = require('fs')
const path = require('path')
const { getPath } = require('../../../config/paths')
const { taskManager } = require('../../basic/task-manager')

async function ensureImageExists(docker, image, addLog, updateProgress) {
  try {
    await docker.getImage(image).inspect()
    addLog(`镜像已存在: ${image}`)
    if (updateProgress) updateProgress(20, '检查镜像完成')
  } catch {
    if (updateProgress) updateProgress(20, '准备拉取镜像')
    addLog(`开始拉取镜像: ${image}`)
    try {
      const stream = await docker.pull(image)
      if (updateProgress) updateProgress(25, '正在拉取镜像')
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          stream,
          (err, res) => {
            if (err) {
              addLog(`镜像拉取失败: ${err.message}`)
              reject(err)
            } else {
              addLog('镜像拉取完成')
              if (updateProgress) updateProgress(40, '镜像拉取完成')
              resolve(res)
            }
          },
          event => {
            if (event && event.status && event.status !== 'Pull complete') {
              addLog(event.status)
              if (!updateProgress) return
              if (event.status.includes('Pulling fs layer')) {
                updateProgress(25, '下载镜像层')
              } else if (event.status.includes('Waiting')) {
                updateProgress(30, '等待下载')
              } else if (event.status.includes('Downloading')) {
                const progress = event.progressDetail || {}
                if (progress.current && progress.total) {
                  const percent = Math.min(
                    40,
                    Math.floor((progress.current / progress.total) * 15) + 25
                  )
                  updateProgress(percent, `下载中: ${event.status}`)
                }
              } else if (event.status.includes('Extracting')) {
                const progress = event.progressDetail || {}
                if (progress.current && progress.total) {
                  const percent = Math.min(
                    40,
                    Math.floor((progress.current / progress.total) * 15) + 25
                  )
                  updateProgress(percent, `解压中: ${event.status}`)
                }
              }
            }
          }
        )
      })
    } catch (error) {
      addLog(`拉取镜像异常: ${error.message}`)
      throw error
    }
  }
}

function resolveContainerDataDir(name) {
  const root = getPath('data', 'www')
  const rootResolved = path.resolve(root)
  const baseDir = getPath('data', 'www', name)
  const dirResolved = path.resolve(baseDir)
  if (!dirResolved.startsWith(rootResolved + path.sep)) return null
  return dirResolved
}

async function runCleanTask(docker, name, logger, updateProgress, addLog) {
  const safeName = String(name || '').trim()
  if (!safeName) {
    addLog('容器名称为空，跳过清理')
    updateProgress(100, '已跳过')
    return
  }
  updateProgress(5, '准备清理挂载目录')
  const dir = resolveContainerDataDir(safeName)
  if (!dir) {
    addLog('挂载目录不在允许范围内，已跳过')
    updateProgress(100, '已跳过')
    return
  }
  let stat
  try {
    stat = fs.statSync(dir)
  } catch {
    addLog('挂载目录不存在，已跳过')
    updateProgress(100, '目录不存在')
    return
  }
  if (!stat.isDirectory()) {
    addLog('目标路径不是目录，已跳过')
    updateProgress(100, '已跳过')
    return
  }
  const image = 'alpine:latest'
  await ensureImageExists(docker, image, msg => addLog(msg), (p, m) => updateProgress(p, m))
  updateProgress(60, '启动临时清理容器')
  const binds = [`${dir}:/target`]
  const cmd = [
    'sh',
    '-c',
    'rm -rf /target/* /target/.[!.]* /target/..?*; chmod 777 /target || true'
  ]
  const container = await docker.createContainer({
    Image: image,
    Cmd: cmd,
    HostConfig: { Binds: binds }
  })
  try {
    await container.start()
    await container.wait()
  } finally {
    try {
      await container.remove({ force: true })
    } catch (e) {
      if (logger && logger.error) {
        logger.error('清理容器删除失败', e)
      }
    }
  }
  updateProgress(100, '清理完成')
  addLog(`已清理目录: ${dir}`)
}

async function createCleanBindsTask(docker, name, logger = console) {
  const taskId = taskManager.createTask('container-clean-binds', { name: String(name || '').trim() })
  taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
    try {
      await runCleanTask(docker, name, logger, updateProgress, addLog)
    } catch (e) {
      addLog(`清理失败: ${e.message}`)
      throw e
    }
  })
  return taskId
}

module.exports = {
  createCleanBindsTask
}
