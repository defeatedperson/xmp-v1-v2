const express = require('express');
const router = express.Router();
const FileListManager = require('../function/file/get-list');
const FileCreateManager = require('../function/file/create');
const FileDeleteManager = require('../function/file/delete');
const FileRenameManager = require('../function/file/rename');
const FileDecompressManager = require('../function/file/decompress');
const FileCompressManager = require('../function/file/compress');
const FileMoveCopyManager = require('../function/file/move-copy');
const FileUploadManager = require('../function/file/upload');
const multer = require('multer');
const FileUrlDownloadManager = require('../function/file/url-download');
const FilePermissionManager = require('../function/file/permission');
const path = require('path')
const fs = require('fs')
const { getPath } = require('../config/paths')
const { normalizeRelative, validateFileName } = require('../function/file/path-utils')

const log = require('../function/basic/log')
const { taskManager } = require('../function/basic/task-manager')
const { validateDownloadParams } = require('../function/router/download-validator')
const { streamDownload } = require('../function/router/stream-downloader')
const { processDownloadRequest } = require('../function/router/folder-download-helper')

/**
 * @route   GET /file-list
 * @desc    获取文件列表
 * @access  Public
 * @param   {string} path - 相对路径（可选，默认为根目录）
 * @param   {string} search - 搜索关键词（可选）
 */
router.get('/file-list', async (req, res) => {
  try {
    const { path: relativePath = '', search = '' } = req.query;
    
    // 创建文件列表管理器实例
    const fileManager = new FileListManager();
    
    // 获取文件列表
    const result = await fileManager.getList(relativePath, search);
    
    // 返回结果
    if (result.success) {
      res.json({
        success: true,
        currentPath: result.currentPath,
        count: result.count,
        data: result.data
      });
    } else {
      log.warning('获取文件列表', String(result.error || 'bad request')).catch(() => {})
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    log.error('获取文件列表', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

module.exports = router;

/**
 * @route   POST /file/create
 * @desc    创建文件或文件夹
 * @access  Public
 * @param   {string} path - 相对路径（可选，默认为根目录）
 * @param   {string} type - 类型：'file' 或 'directory'
 * @param   {string} name - 名称
 * @param   {string} content - 文件内容（当 type 为 'file' 时可选）
 */
router.post('/file/create', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch {}
    }
    if ((!payload.type || !payload.name) && req.query) {
      payload = { ...req.query, ...payload }
    }
    const { path: relativePath = '', type, name, content = '' } = payload
    if (!type || !name) {
      log.warning('创建文件', 'missing type or name').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：type 和 name' })
    }
    if (!['file', 'directory'].includes(type)) {
      log.warning('创建文件', 'invalid type').catch(() => {})
      return res.status(400).json({ success: false, error: '类型参数无效，必须是 file 或 directory' })
    }
    if (!validateFileName(name)) {
      log.warning('创建文件', 'invalid name').catch(() => {})
      return res.status(400).json({ success: false, error: '名称包含非法字符' })
    }
    const manager = new FileCreateManager()
    const result = await manager.create(relativePath, type, name, content)
    if (result.success) {
      log.info('创建文件', JSON.stringify({ path: relativePath, type, name })).catch(() => {})
      return res.json(result)
    }
    log.warning('创建文件', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error })
  } catch (error) {
    log.error('创建文件', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/**
 * @route   POST /file/delete
 * @desc    删除文件或文件夹
 * @access  Public
 * @param   {string} path - 相对路径（可选，默认为根目录）
 * @param   {string} type - 类型：'file' 或 'directory'
 * @param   {string} name - 文件或文件夹名称
 * @param   {boolean} force - 是否强制删除（可选，默认false）
 */
router.post('/file/delete', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch {}
    }
    if ((!payload.type || !payload.name) && req.query) {
      payload = { ...req.query, ...payload }
    }
    const { path: relativePath = '', type, name, force = false } = payload
    if (!type || !name) {
      log.warning('删除文件', 'missing type or name').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：type 和 name' })
    }
    if (!['file', 'directory'].includes(type)) {
      log.warning('删除文件', 'invalid type').catch(() => {})
      return res.status(400).json({ success: false, error: '类型参数无效，必须是 file 或 directory' })
    }
    if (!validateFileName(name)) {
      log.warning('删除文件', 'invalid name').catch(() => {})
      return res.status(400).json({ success: false, error: '名称包含非法字符' })
    }
    const manager = new FileDeleteManager()
    const result = await manager.delete(relativePath, type, name, force)
    if (result.success) {
      log.info('删除文件', JSON.stringify({ path: relativePath, type, name, force: Boolean(force), taskId: result.taskId })).catch(() => {})
      return res.json(result)
    }
    log.warning('删除文件', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error })
  } catch (error) {
    log.error('删除文件', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/**
 * @route   POST /file/move
 * @desc    移动文件或文件夹
 * @access  Public
 * @param   {string} sourcePath - 源相对路径（含文件/文件夹名）
 * @param   {string} destPath - 目标相对路径（目录或完整目标路径）
 * @param   {string} newName - 新名称（可选）
 */
router.post('/file/move', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    if ((!payload.sourcePath || !payload.destPath) && req.query) {
      payload = { ...req.query, ...payload }
    }
    const { sourcePath = '', destPath = '', newName = null } = payload
    if (!sourcePath || !destPath) {
      log.warning('移动文件', 'missing sourcePath or destPath').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：sourcePath 和 destPath' })
    }
    if (newName && !validateFileName(newName)) {
      log.warning('移动文件', 'invalid newName').catch(() => {})
      return res.status(400).json({ success: false, error: '新名称包含非法字符' })
    }
    const manager = new FileMoveCopyManager()
    const result = await manager.move(sourcePath, destPath, newName || null)
    if (result.success) return res.json(result)
    log.warning('移动文件', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error })
  } catch (error) {
    log.error('移动文件', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/**
 * @route   POST /file/copy
 * @desc    复制文件或文件夹
 * @access  Public
 * @param   {string} sourcePath - 源相对路径（含文件/文件夹名）
 * @param   {string} destPath - 目标相对路径（目录或完整目标路径）
 * @param   {string} newName - 新名称（可选）
 */
router.post('/file/copy', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    if ((!payload.sourcePath || !payload.destPath) && req.query) {
      payload = { ...req.query, ...payload }
    }
    const { sourcePath = '', destPath = '', newName = null } = payload
    if (!sourcePath || !destPath) {
      log.warning('复制文件', 'missing sourcePath or destPath').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：sourcePath 和 destPath' })
    }
    if (newName && !validateFileName(newName)) {
      log.warning('复制文件', 'invalid newName').catch(() => {})
      return res.status(400).json({ success: false, error: '新名称包含非法字符' })
    }
    const taskId = taskManager.createTask('copy', { sourcePath, destPath, newName: newName || null })
    taskManager.executeTask(taskId, async (id, progress, addLog) => {
      const manager = new FileMoveCopyManager()
      addLog('任务开始: 复制')
      progress(50, '任务进行中')
      const result = await manager.copy(sourcePath, destPath, newName || null)
      if (!result.success) {
        throw new Error(result.error || '复制失败')
      }
      taskManager.updateTask(id, { result })
    })
    log.info('复制文件', JSON.stringify({ sourcePath, destPath, newName, taskId })).catch(() => {})
    return res.json({ success: true, taskId })
  } catch (error) {
    log.error('复制文件', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})



/**
 * @route   POST /file/upload/check
 * @desc    检查目标文件是否重名
 * @access  Public
 * @param   {string} fileName - 文件名
 * @param   {string} relativePath - 相对路径（可选）
 */
router.post('/file/upload/check', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    if ((!payload.fileName) && req.query) { payload = { ...req.query, ...payload } }
    const { fileName = '', relativePath = '' } = payload
    if (!fileName) return res.status(400).json({ success: false, error: '缺少必需参数：fileName' })
    if (!validateFileName(fileName)) {
      log.warning('上传检查', 'invalid fileName').catch(() => {})
      return res.status(400).json({ success: false, error: '文件名包含非法字符' })
    }
    const manager = new FileUploadManager()
    const result = await manager.checkFile(fileName, relativePath)
    if (result.success) {
      return res.json(result)
    }
    log.warning('上传检查', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error })
  } catch (error) {
    log.error('上传检查', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const fileHash = (req.body && req.body.fileHash) || (req.query && req.query.fileHash) || ''
      const tempDir = path.join(getPath('data','www','temp'), fileHash || 'unknown')
      fs.mkdirSync(tempDir, { recursive: true })
      cb(null, tempDir)
    } catch (e) { cb(e) }
  },
  filename: (req, _file, cb) => {
    try {
      const chunkIndex = Number((req.body && req.body.chunkIndex) || (req.query && req.query.chunkIndex) || 0)
      cb(null, 'chunk_' + chunkIndex)
    } catch (e) { cb(e) }
  }
})
const upload = multer({ storage })

/**
 * @route   POST /file/upload/chunk
 * @desc    上传分片
 * @access  Public
 * @param   {file} chunk - 分片文件
 * @param   {string} fileName - 文件名
 * @param   {string} fileHash - 文件hash
 * @param   {number} chunkIndex - 分片序号
 * @param   {number} totalChunks - 分片总数
 * @param   {string} relativePath - 相对路径（可选）
 */
router.post('/file/upload/chunk', upload.single('chunk'), async (req, res) => {
  try {
    const file = req.file
    const { fileName = '', fileHash = '', chunkIndex = 0, totalChunks = 1, relativePath = '' } = req.body || {}
    if (!file || !fileName || !fileHash) {
      log.warning('上传分片', 'missing chunk/fileName/fileHash').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：chunk、fileName、fileHash' })
    }
    if (!validateFileName(fileName)) {
      log.warning('上传分片', 'invalid fileName').catch(() => {})
      return res.status(400).json({ success: false, error: '文件名包含非法字符' })
    }
    const manager = new FileUploadManager()
    const result = await manager.uploadChunk(file.path, fileName, fileHash, Number(chunkIndex), Number(totalChunks), relativePath)
    if (result.success) return res.json(result)
    log.warning('上传分片', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error })
  } catch (error) {
    log.error('上传分片', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/**
 * @route   POST /file/upload/merge
 * @desc    合并分片
 * @access  Public
 * @param   {string} fileName - 文件名
 * @param   {string} fileHash - 文件hash
 * @param   {number} totalChunks - 分片总数
 * @param   {string} relativePath - 相对路径（可选）
 */
router.post('/file/upload/merge', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    if ((!payload.fileName || !payload.fileHash) && req.query) { payload = { ...req.query, ...payload } }
    const { fileName = '', fileHash = '', totalChunks = 1, relativePath = '' } = payload
    if (!fileName || !fileHash) {
      log.warning('合并分片', 'missing fileName or fileHash').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：fileName 和 fileHash' })
    }
    if (!validateFileName(fileName)) {
      log.warning('合并分片', 'invalid fileName').catch(() => {})
      return res.status(400).json({ success: false, error: '文件名包含非法字符' })
    }
    const manager = new FileUploadManager()
    const result = await manager.mergeChunks(fileName, fileHash, Number(totalChunks), relativePath)
    if (result.success) {
      log.info('合并分片', JSON.stringify({ fileName, relativePath, totalChunks: Number(totalChunks) })).catch(() => {})
      return res.json(result)
    }
    log.warning('合并分片', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error })
  } catch (error) {
    log.error('合并分片', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

router.post('/file/url-download', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    if ((!payload.nodeAddress) && req.query) { payload = { ...req.query, ...payload } }

    const {
      nodeAddress = '',
      type = 'file',
      path: sourcePath = '',
      name = '',
      clientCert = null,
      clientKey = null,
      savePath = '/文件接收柜'
    } = payload

    if (!nodeAddress) {
      log.warning('URL下载', 'missing nodeAddress').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：nodeAddress' })
    }

    if (!clientCert || !clientKey) {
      log.warning('URL下载', 'missing client cert or key').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少客户端证书或密钥' })
    }

    if (!['file', 'folder'].includes(type)) {
      log.warning('URL下载', 'invalid type').catch(() => {})
      return res.status(400).json({ success: false, error: '无效的类型参数' })
    }

    const safePath = normalizeRelative(sourcePath)
    const safeSavePath = normalizeRelative(savePath)

    const taskId = taskManager.createTask('url-download', {
      nodeAddress: String(nodeAddress),
      type: String(type),
      path: safePath,
      name: String(name),
      savePath: safeSavePath
    })

    taskManager.executeTask(taskId, async (id, progress, addLog) => {
      const manager = new FileUrlDownloadManager(null)

      addLog('任务开始: 下载')

      const result = await manager.downloadFromNode(
        nodeAddress,
        {
          type: type,
          path: safePath,
          name: name,
          clientCert: clientCert,
          clientKey: clientKey,
          savePath: safeSavePath
        },
        (prog, msg) => {
          progress(prog, msg)
        }
      )

      if (!result.success) {
        throw new Error(result.error || '下载失败')
      }

      taskManager.updateTask(id, { result })
    })

    log.info('URL下载', JSON.stringify({ nodeAddress, type, path: sourcePath, name, savePath: safeSavePath, taskId })).catch(() => {})
    return res.json({ success: true, taskId })
  } catch (error) {
    log.error('URL下载', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})



/**
 * @route   POST /file/permission/set
 * @desc    设置文件或文件夹权限（可选递归）
 * @access  Public
 * @param   {string} path - 相对路径（可选）
 * @param   {string} name - 文件或文件夹名称
 * @param   {string} permissions - 三位八进制，如 755/644
 * @param   {boolean} recursive - 是否递归（仅目录有效）
 */
router.post('/file/permission/set', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    if ((!payload.name || !payload.permissions) && req.query) { payload = { ...req.query, ...payload } }
    const { path: relativePath = '', name = '', permissions = '', recursive = false } = payload
    if (!name || !permissions) {
      log.warning('设置权限', 'missing name or permissions').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：name 和 permissions' })
    }
    if (!validateFileName(name)) {
      log.warning('设置权限', 'invalid name').catch(() => {})
      return res.status(400).json({ success: false, error: '名称包含非法字符' })
    }
    const manager = new FilePermissionManager()
    const result = await manager.setPermission(relativePath, name, String(permissions), Boolean(recursive))
    if (result.success) {
      log.info('设置权限', JSON.stringify({ path: relativePath, name, permissions, recursive: Boolean(recursive) })).catch(() => {})
      return res.json(result)
    }
    log.warning('设置权限', String(result.error || result.message || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error || result.message })
  } catch (error) {
    log.error('设置权限', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/**
 * @route   POST /file/permission/get
 * @desc    获取文件或文件夹权限信息
 * @access  Public
 * @param   {string} path - 相对路径（可选）
 * @param   {string} name - 文件或文件夹名称
 */
router.post('/file/permission/get', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    if ((!payload.name) && req.query) { payload = { ...req.query, ...payload } }
    const { path: relativePath = '', name = '' } = payload
    if (!name) {
      log.warning('获取权限', 'missing name').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：name' })
    }
    if (!validateFileName(name)) {
      log.warning('获取权限', 'invalid name').catch(() => {})
      return res.status(400).json({ success: false, error: '名称包含非法字符' })
    }
    const manager = new FilePermissionManager()
    const result = await manager.getPermission(relativePath, name)
    if (result.success) {
      return res.json(result)
    }
    log.warning('获取权限', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error })
  } catch (error) {
    log.error('获取权限', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

router.post('/file/rename', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch {}
    }
    if ((!payload.type || !payload.oldName || !payload.newName) && req.query) {
      payload = { ...req.query, ...payload }
    }
    const { path: relativePath = '', type, oldName, newName } = payload
    if (!type || !oldName || !newName) {
      log.warning('重命名', 'missing type/oldName/newName').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：type、oldName 和 newName' })
    }
    if (!['file', 'directory'].includes(type)) {
      log.warning('重命名', 'invalid type').catch(() => {})
      return res.status(400).json({ success: false, error: '类型参数无效，必须是 file 或 directory' })
    }
    if (!validateFileName(oldName) || !validateFileName(newName)) {
      log.warning('重命名', 'invalid name').catch(() => {})
      return res.status(400).json({ success: false, error: '名称包含非法字符' })
    }
    const manager = new FileRenameManager()
    const result = await manager.rename(relativePath, type, oldName, newName)
    if (result.success) {
      log.info('重命名', JSON.stringify({ path: relativePath, type, oldName, newName })).catch(() => {})
      return res.json(result)
    }
    log.warning('重命名', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error })
  } catch (error) {
    log.error('重命名', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/**
 * @route   POST /file/decompress
 * @desc    解压压缩包（支持 zip、tar、tar.gz/tgz、gz）
 * @access  Public
 * @param   {string} path - 相对路径（可选，默认为根目录）
 * @param   {string} archiveName - 压缩包文件名
 * @param   {string} extractPath - 解压目标路径（可选，默认同名目录）
 */
router.post('/file/decompress', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch {}
    }
    if ((!payload.archiveName) && req.query) {
      payload = { ...req.query, ...payload }
    }
    const { path: relativePath = '', archiveName, extractPath = '' } = payload
    if (!archiveName) {
      log.warning('解压文件', 'missing archiveName').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：archiveName' })
    }
    if (!validateFileName(archiveName)) {
      log.warning('解压文件', 'invalid archiveName').catch(() => {})
      return res.status(400).json({ success: false, error: '压缩包名称包含非法字符' })
    }
    const taskId = taskManager.createTask('decompress', { path: relativePath, archiveName, extractPath })
    taskManager.executeTask(taskId, async (id, progress, addLog) => {
      const manager = new FileDecompressManager()
      addLog('任务开始: 解压')
      progress(50, '任务进行中')
      const result = await manager.extractArchive(relativePath, archiveName, extractPath)
      if (!result.success) {
        throw new Error(result.error || '解压失败')
      }
      taskManager.updateTask(id, { result })
    })
    log.info('解压文件', JSON.stringify({ path: relativePath, archiveName, extractPath, taskId })).catch(() => {})
    return res.json({ success: true, taskId })
  } catch (error) {
    log.error('解压文件', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})



/**
 * @route   POST /file/compress
 * @desc    创建压缩包（默认生成 .zip）
 * @access  Public
 * @param   {string} path - 相对路径（可选，默认为根目录）
 * @param   {string} sourceName - 源文件或文件夹名称
 * @param   {string} archiveName - 压缩包名称（可选，默认源名.zip）
 */
router.post('/file/compress', async (req, res) => {
  try {
    let payload = req.body || {}
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch {}
    }
    if ((!payload.sourceName) && req.query) {
      payload = { ...req.query, ...payload }
    }
    const { path: relativePath = '', sourceName, archiveName = '' } = payload
    if (!sourceName) {
      log.warning('压缩文件', 'missing sourceName').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少必需参数：sourceName' })
    }
    if (!validateFileName(sourceName)) {
      log.warning('压缩文件', 'invalid sourceName').catch(() => {})
      return res.status(400).json({ success: false, error: '源名称包含非法字符' })
    }
    if (archiveName && !validateFileName(archiveName)) {
      log.warning('压缩文件', 'invalid archiveName').catch(() => {})
      return res.status(400).json({ success: false, error: '压缩包名称包含非法字符' })
    }
    const taskId = taskManager.createTask('compress', { path: relativePath, sourceName, archiveName })
    taskManager.executeTask(taskId, async (id, progress, addLog) => {
      const manager = new FileCompressManager()
      addLog('任务开始: 压缩')
      progress(50, '任务进行中')
      const result = await manager.createArchive(relativePath, sourceName, archiveName)
      if (!result.success) {
        throw new Error(result.error || '压缩失败')
      }
      taskManager.updateTask(id, { result })
    })
    log.info('压缩文件', JSON.stringify({ path: relativePath, sourceName, archiveName, taskId })).catch(() => {})
    return res.json({ success: true, taskId })
  } catch (error) {
    log.error('压缩文件', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})



/**
 * @route   GET /file/download
 * @desc    文件下载接口（仅处理文件类型，文件夹请使用 /file/download/prepare）
 * @access  mTLS
 * @param   {string} d - base64编码的JSON，包含 path 和 type
 */
router.get('/file/download', async (req, res) => {
  try {
    const relPath = String(req.query.path || '')
    const fileName = String(req.query.name || '')
    const t = String(req.query.type || '').toLowerCase()

    if (!relPath || !fileName || !['file', 'folder'].includes(t)) {
      log.warning('下载文件', 'invalid params').catch(() => {})
      return res.status(400).json({ success: false, error: '参数无效：需要 path、name 和 type(file/folder)' })
    }

    if (t === 'folder') {
      log.warning('下载文件', 'use prepare endpoint for folder').catch(() => {})
      return res.status(400).json({
        success: false,
        error: '文件夹下载请使用 /file/download/prepare 接口'
      })
    }

    const wwwBase = path.resolve(getPath('data', 'www'))
    const fullPath = path.join(wwwBase, relPath, fileName)

    let realBase, realTarget
    try {
      realBase = fs.realpathSync(wwwBase)
      realTarget = fs.realpathSync(fullPath)
      if (!realTarget.startsWith(realBase)) {
        log.warning('下载文件', 'unsafe path').catch(() => {})
        return res.status(403).json({ success: false, error: '文件路径不安全' })
      }
    } catch {
      log.warning('下载文件', 'not found').catch(() => {})
      return res.status(404).json({ success: false, error: '文件不存在' })
    }

    let stat
    try {
      stat = fs.statSync(fullPath)
    } catch {
      log.warning('下载文件', 'not found').catch(() => {})
      return res.status(404).json({ success: false, error: '文件不存在' })
    }

    if (!stat.isFile()) {
      log.warning('下载文件', 'not a file').catch(() => {})
      return res.status(400).json({ success: false, error: '指定路径不是文件' })
    }

    await streamDownload(res, fullPath, path.basename(fullPath))
  } catch (error) {
    log.error('下载文件', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/**
 * @route   GET /file/download/prepare
 * @desc    文件夹下载准备接口（压缩打包，返回任务状态）
 * @access  mTLS
 * @param   {string} path - 路径
 * @param   {string} name - 文件夹名
 * @param   {string} type - 类型
 */
router.get('/file/download/prepare', async (req, res) => {
  try {
    const relPath = String(req.query.path || '')
    const fileName = String(req.query.name || '')
    const t = String(req.query.type || '').toLowerCase()

    if (!relPath || !['file', 'folder'].includes(t)) {
      log.warning('下载准备', 'invalid params').catch(() => {})
      return res.status(400).json({ success: false, error: '参数无效：需要 path 和 type(file/folder)' })
    }

    if (t === 'file') {
      log.warning('下载准备', 'use download endpoint for file').catch(() => {})
      return res.status(400).json({
        success: false,
        error: '文件下载请使用 /file/download 接口'
      })
    }

    const payload = { path: relPath, name: fileName, type: t }

    const validation = await validateDownloadParams(payload)
    if (!validation.valid) {
      log.warning('下载准备', validation.error).catch(() => {})
      return res.status(validation.status).json({ success: false, error: validation.error })
    }

    const result = processDownloadRequest(payload)

    if (result.status === 'pending') {
      log.info('下载准备-进行中', JSON.stringify({ taskId: result.taskId })).catch(() => {})
      return res.json({
        success: true,
        status: 'pending',
        taskId: result.taskId,
        progress: result.progress,
        message: result.message
      })
    }

    if (result.status === 'completed') {
      log.info('下载准备-完成', JSON.stringify({ path: result.result.path })).catch(() => {})
      return res.json({
        success: true,
        status: 'completed',
        path: result.result.path,
        name: result.result.name
      })
    }

    if (result.status === 'failed') {
      log.warning('下载准备-失败', result.error).catch(() => {})
      return res.status(500).json({
        success: false,
        status: 'failed',
        error: result.error
      })
    }
  } catch (error) {
    log.error('下载准备', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

router.get('/file-task/status', async (req, res) => {
  try {
    const id = String((req.query && req.query.id) || '')
    if (!id) {
      log.warning('任务状态', 'missing id').catch(() => {})
      return res.status(400).json({ success: false, error: '缺少任务ID' })
    }
    const { isValidTaskId } = require('../function/basic/task-id')
    if (!isValidTaskId(id)) {
      log.warning('任务状态', 'invalid id').catch(() => {})
      return res.status(400).json({ success: false, error: '任务ID不合法' })
    }
    const task = taskManager.getTask(id)
    if (!task) {
      log.warning('任务状态', 'not found').catch(() => {})
      return res.status(404).json({ success: false, error: '任务不存在' })
    }
    const { status, message, result } = task
    return res.json({ success: true, data: { status, message, result } })
  } catch (error) {
    log.error('任务状态', String(error && error.message || 'error')).catch(() => {})
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})
