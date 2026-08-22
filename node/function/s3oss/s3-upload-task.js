const fs = require('fs')
const { taskManager } = require('../basic/task-manager')
const { createS3ContextWithTest, getTaskObjectPrefix } = require('./s3-backup-tool')
const { uploadObject, listObjectsByPrefix, deleteObjects } = require('./s3-client')

async function runS3UploadBackupTask(taskId, data, updateProgress, addLog) {
  const profileId = Number(data && data.profileId)
  const taskName = String(data && data.taskName || '').trim()
  const objects = Array.isArray(data && data.objects) ? data.objects : []
  const remoteCopiesRaw = data && data.remoteCopies
  const remoteCopies = Number.isFinite(Number(remoteCopiesRaw)) && Number(remoteCopiesRaw) > 0 ? Number(remoteCopiesRaw) : 0
  const deleteLocalAfterUpload = !!(data && data.deleteLocalAfterUpload)

  if (!profileId || !taskName) {
    throw new Error('S3上传任务参数不完整')
  }
  if (!objects.length) {
    throw new Error('S3上传对象列表为空')
  }

  addLog(`使用 S3 配置 profileId=${profileId}`)
  updateProgress(5, '初始化S3客户端')
  const ctx = await createS3ContextWithTest(profileId)
  addLog(`S3连接测试通过，bucket=${ctx.bucket}`)

  const total = objects.length
  let uploadedCount = 0
  const uploadedKeys = []
  const deletedRemoteKeys = []
  const deletedLocalFiles = []

  for (let index = 0; index < total; index++) {
    const item = objects[index]
    if (!item || !item.localPath || !item.objectKey) {
      throw new Error('S3上传对象描述无效')
    }
    const localPath = String(item.localPath)
    const objectKey = String(item.objectKey)
    addLog(`上传对象 ${index + 1}/${total}: ${localPath} -> ${objectKey}`)
    updateProgress(10 + Math.floor((index / total) * 60), '上传备份文件到S3')
    try {
      await uploadObject(ctx.client, ctx.bucket, objectKey, localPath)
      uploadedCount++
      uploadedKeys.push(objectKey)
      addLog(`上传完成: ${objectKey}`)
    } catch (error) {
      addLog(`上传失败: ${objectKey}, 错误: ${error.message}`)
      throw error
    }
  }

  addLog(`全部对象上传完成，总数=${uploadedCount}`)

  if (remoteCopies > 0) {
    updateProgress(75, '执行远端保留策略')
    const prefix = getTaskObjectPrefix(taskName)
    addLog(`列举远端前缀: ${prefix}`)
    const items = await listObjectsByPrefix(ctx.client, ctx.bucket, prefix)
    const byKey = new Map()
    for (const it of items) {
      if (!it || !it.key) continue
      byKey.set(it.key, it)
    }
    const logicalUnits = new Map()
    for (const key of byKey.keys()) {
      const base = key.replace(prefix, '').replace(/\.[^.]+$/, '')
      if (!logicalUnits.has(base)) {
        logicalUnits.set(base, [])
      }
      logicalUnits.get(base).push(key)
    }
    const unitEntries = Array.from(logicalUnits.entries()).map(([base, keys]) => {
      let ts = 0
      const parts = base.split('-')
      const last = parts[parts.length - 1] || ''
      if (/^\d{14}$/.test(last)) {
        const year = Number(last.slice(0, 4))
        const month = Number(last.slice(4, 6)) - 1
        const day = Number(last.slice(6, 8))
        const hour = Number(last.slice(8, 10))
        const minute = Number(last.slice(10, 12))
        const second = Number(last.slice(12, 14))
        const d = new Date(Date.UTC(year, month, day, hour, minute, second))
        ts = d.getTime()
      }
      if (!Number.isFinite(ts) || ts <= 0) {
        ts = 0
      }
      return { base, keys, ts }
    })
    unitEntries.sort((a, b) => b.ts - a.ts)
    const unitsToKeep = unitEntries.slice(0, remoteCopies)
    const unitsToDelete = unitEntries.slice(remoteCopies)
    const keysToKeep = new Set()
    for (const u of unitsToKeep) {
      for (const key of u.keys) {
        keysToKeep.add(key)
      }
    }
    const keysToDelete = []
    for (const u of unitsToDelete) {
      for (const key of u.keys) {
        if (!keysToKeep.has(key)) {
          keysToDelete.push(key)
        }
      }
    }
    if (keysToDelete.length > 0) {
      addLog(`清理远端旧对象数量: ${keysToDelete.length}`)
      await deleteObjects(ctx.client, ctx.bucket, keysToDelete)
      deletedRemoteKeys.push(...keysToDelete)
    } else {
      addLog('远端无需清理旧对象')
    }
  }

  if (deleteLocalAfterUpload) {
    updateProgress(85, '清理本地备份文件')
    for (const item of objects) {
      const localPath = String(item.localPath)
      try {
        fs.unlinkSync(localPath)
        deletedLocalFiles.push(localPath)
        addLog(`已删除本地文件: ${localPath}`)
      } catch (error) {
        addLog(`删除本地文件失败: ${localPath}, 错误: ${error.message}`)
      }
    }
  }

  updateProgress(95, '整理任务结果')
  const result = {
    success: true,
    uploadedObjects: uploadedKeys,
    deletedRemoteObjects: deletedRemoteKeys,
    deletedLocalFiles
  }
  taskManager.updateTask(taskId, { result })
  updateProgress(100, 'S3备份上传完成')
}

function createS3UploadBackupTask(data) {
  const taskId = taskManager.createTask('s3.upload-backup', data || {})
  taskManager.executeTask(taskId, async (id, updateProgress, addLog) => {
    await runS3UploadBackupTask(id, data, updateProgress, addLog)
  })
  return taskId
}

module.exports = {
  createS3UploadBackupTask,
  runS3UploadBackupTask
}

