/**
 * 强制删除工具 (Force Deleter)
 * 
 * 功能说明：
 * 使用临时 Docker 容器 (Alpine) 挂载宿主机目录，以 root 权限执行 rm -rf 操作。
 * 主要用于解决 Node.js 进程权限不足（如无法删除由 Docker 创建的 root 权限文件）的问题。
 * 
 * 包含功能：
 * 1. 镜像检查与自动拉取 (ensureImageExists)
 * 2. 路径安全校验 (防止误删系统文件)
 * 3. 类型校验 (确保删除对象类型匹配)
 * 4. 异步任务封装 (createForceDeleteTask)
 */

const fs = require('fs')
const path = require('path')
const { getPath } = require('../../../config/paths')
const { taskManager } = require('../../basic/task-manager')

/**
 * 确保镜像存在，不存在则拉取
 * @param {Object} docker Docker实例
 * @param {string} image 镜像名称
 * @param {Function} addLog 日志回调
 * @param {Function} updateProgress 进度回调
 */
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
              // 简单的进度估算
              if (event.status.includes('Downloading') || event.status.includes('Extracting')) {
                const progress = event.progressDetail || {}
                if (progress.current && progress.total) {
                  // 将下载解压过程映射到 25% - 40% 的进度区间
                  const percent = Math.min(40, 25 + Math.floor((progress.current / progress.total) * 15))
                  updateProgress(percent, `${event.status.split(' ')[0]}...`)
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

/**
 * 校验路径安全性
 * 仅允许删除 data/www 下的文件或目录
 * @param {string} targetPath 目标绝对路径
 * @returns {boolean} 是否安全
 */
function isPathSafe(targetPath) {
  if (!targetPath) return false
  const wwwRoot = path.resolve(getPath('data', 'www'))
  const resolvedPath = path.resolve(targetPath)
  
  // 必须在 www 目录下，且不能是 www 目录本身
  return resolvedPath.startsWith(wwwRoot) && resolvedPath !== wwwRoot
}

/**
 * 执行强制删除的核心逻辑
 * @param {Object} docker Docker实例
 * @param {string} targetPath 要删除的文件或目录的绝对路径
 * @param {string} type 目标类型 ('file' | 'directory' | 'folder')
 * @param {Object} logger 日志对象 (console)
 * @param {Function} updateProgress 进度更新回调
 * @param {Function} addLog 日志添加回调
 */
async function runForceDelete(docker, targetPath, type, logger, updateProgress, addLog) {
  const safePath = String(targetPath || '').trim()
  const targetType = String(type || '').toLowerCase()
  
  // 1. 基础校验
  if (!safePath) {
    addLog('目标路径为空，操作终止')
    throw new Error('目标路径为空')
  }

  if (!['file', 'directory', 'folder'].includes(targetType)) {
    addLog(`无效的目标类型: ${targetType}`)
    throw new Error('无效的目标类型 (必须为 file 或 directory)')
  }

  // 2. 路径存在性与类型检查
  if (!fs.existsSync(safePath)) {
    addLog(`目标路径不存在: ${safePath}`)
    if (updateProgress) updateProgress(100, '目标不存在，无需删除')
    return
  }

  const stat = fs.statSync(safePath)
  const isDir = stat.isDirectory()
  const isFile = stat.isFile()

  if ((targetType === 'file' && !isFile) || ((targetType === 'directory' || targetType === 'folder') && !isDir)) {
    const actualType = isDir ? 'directory' : 'file'
    addLog(`目标类型不匹配: 预期 ${targetType}, 实际为 ${actualType}`)
    throw new Error(`目标类型不匹配: 路径是一个 ${actualType}，但请求删除的是 ${targetType}`)
  }

  // 3. 安全性检查
  if (!isPathSafe(safePath)) {
    addLog(`路径不安全或超出允许范围: ${safePath}`)
    throw new Error('拒绝删除：目标路径不在允许的安全范围内 (仅限 data/www 及其子目录)')
  }

  const parentDir = path.dirname(safePath)
  const targetName = path.basename(safePath)
  
  addLog(`准备删除目标: ${targetName} (${targetType})`)
  addLog(`所在目录: ${parentDir}`)

  // 4. 准备镜像
  const image = 'alpine:latest'
  await ensureImageExists(docker, image, msg => addLog(msg), (p, m) => updateProgress && updateProgress(p, m))

  if (updateProgress) updateProgress(60, '启动临时容器执行删除')

  // 5. 构造容器参数
  // 挂载父目录到容器的 /workdir
  const binds = [`${parentDir}:/workdir`]
  // 使用 rm -rf 强制删除
  const cmd = [
    'sh',
    '-c',
    `rm -rf "/workdir/${targetName}"`
  ]

  const container = await docker.createContainer({
    Image: image,
    Cmd: cmd,
    HostConfig: { 
      Binds: binds,
      AutoRemove: false // 手动控制删除以捕获错误，或者使用 finally 块确保删除
    }
  })

  try {
    addLog('容器已创建，开始执行...')
    await container.start()
    
    // 等待容器执行结束
    const result = await container.wait()
    
    if (result.StatusCode !== 0) {
      throw new Error(`删除操作退出码非0: ${result.StatusCode}`)
    }
    
    addLog('删除命令执行完毕')
  } catch (err) {
    addLog(`容器执行出错: ${err.message}`)
    throw err
  } finally {
    // 6. 清理容器
    try {
      addLog('清理临时容器')
      await container.remove({ force: true })
    } catch (e) {
      if (logger) logger.error('临时容器删除失败', e)
    }
  }

  // 再次检查文件是否真的消失了
  if (fs.existsSync(safePath)) {
    throw new Error('操作显示成功，但目标文件仍然存在，可能是文件系统锁或挂载问题')
  }

  if (updateProgress) updateProgress(100, '删除完成')
  addLog(`成功删除: ${safePath}`)
}

/**
 * 创建强制删除的异步任务
 * @param {Object} docker Docker实例
 * @param {string} targetPath 目标绝对路径
 * @param {string} type 目标类型 ('file' | 'directory')
 * @param {Object} logger 日志对象
 * @returns {Promise<string>} 任务ID
 */
async function createForceDeleteTask(docker, targetPath, type, logger = console) {
  // 生成任务ID
  const targetName = path.basename(targetPath)
  const taskId = taskManager.createTask('force-delete', { 
    path: targetPath,
    type: type,
    name: targetName 
  })

  // 异步执行
  taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
    try {
      updateProgress(0, '任务初始化')
      await runForceDelete(docker, targetPath, type, logger, updateProgress, addLog)
    } catch (e) {
      addLog(`强制删除失败: ${e.message}`)
      throw e
    }
  })

  return taskId
}

module.exports = {
  runForceDelete,
  createForceDeleteTask
}
