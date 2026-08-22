const fs = require('fs')
const path = require('path')
const { getPath } = require('../../config/paths')
const log = require('../basic/log')
const { taskManager } = require('../basic/task-manager')

const folderTaskCache = new Map()

const FOLDER_TASK_TYPE = 'download-folder-compress'

function processDownloadRequest(payload) {
  const { type } = payload
  const cacheKey = JSON.stringify(payload)

  if (type === 'file') {
    return {
      status: 'completed',
      result: {
        path: payload.path,
        name: payload.name || path.basename(payload.path)
      }
    }
  }

  if (folderTaskCache.has(cacheKey)) {
    const taskId = folderTaskCache.get(cacheKey)
    const task = taskManager.getTask(taskId)

    if (!task) {
      folderTaskCache.delete(cacheKey)
      return processDownloadRequest(payload)
    }

    if (task.status === 'pending' || task.status === 'running') {
      return {
        status: 'pending',
        taskId,
        progress: task.progress || 0,
        message: task.message || '任务进行中'
      }
    }

    if (task.status === 'completed') {
      const result = task.result

      folderTaskCache.delete(cacheKey)
      log.info('文件夹压缩任务完成', JSON.stringify({ taskId, newPath: result.data.relativePath })).catch(() => {})

      const fullPath = result.data.relativePath
      const name = path.basename(fullPath)
      const parentPath = path.posix.dirname(fullPath)

      return {
        status: 'completed',
        result: {
          path: parentPath,
          name: name
        }
      }
    }

    if (task.status === 'failed') {
      folderTaskCache.delete(cacheKey)
      log.warning('文件夹压缩任务失败', JSON.stringify({ taskId, error: task.message })).catch(() => {})
      return {
        status: 'failed',
        error: task.message || '压缩失败'
      }
    }
  }

  const folderName = payload.name || path.basename(payload.path)
  const parentDir = payload.path
  const archiveName = `${folderName}_${Date.now()}.zip`

  const taskData = { relPath: payload.path, folderName, parentDir, archiveName }
  const taskId = taskManager.createTask(FOLDER_TASK_TYPE, taskData)
  folderTaskCache.set(cacheKey, taskId)

  taskManager.executeTask(taskId, async (id, progress, addLog) => {
    const FileCompressManager = require('../file/compress')
    const compressManager = new FileCompressManager()

    addLog('任务开始: 下载文件夹压缩')
    progress(50, '任务进行中')

    const result = await compressManager.createArchive(parentDir, folderName, archiveName)
    if (!result.success) {
      throw new Error(result.error || '压缩文件夹失败')
    }

    const tempBase = getPath('data', 'www', 'temp')
    const tempDownloads = path.join(tempBase, 'downloads')
    try { fs.mkdirSync(tempDownloads, { recursive: true }) } catch {}

    const wwwBase = path.resolve(getPath('data', 'www'))
    const srcFull = path.join(wwwBase, String(result.data && result.data.relativePath || '').replace(/^\/+/, ''))
    const finalName = path.basename(srcFull)
    const dstFull = path.join(tempDownloads, finalName)

    try {
      fs.renameSync(srcFull, dstFull)
    } catch {
      try {
        fs.copyFileSync(srcFull, dstFull)
        fs.unlinkSync(srcFull)
      } catch {
        throw new Error('移动压缩文件失败')
      }
    }

    const statMoved = fs.statSync(dstFull)
    const relNew = '/' + String(path.relative(wwwBase, dstFull)).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

    if (result && result.data) {
      result.data.relativePath = relNew
      result.data.parentPath = '/temp/downloads'
      result.data.size = statMoved.size
    }

    taskManager.updateTask(id, { result })
  })

  log.info('创建文件夹压缩任务', JSON.stringify({ taskId, path: payload.path })).catch(() => {})

  return {
    status: 'pending',
    taskId,
    progress: 0,
    message: '任务已创建'
  }
}

module.exports = {
  processDownloadRequest
}
