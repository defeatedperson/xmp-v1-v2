const fsp = require('fs').promises
const path = require('path')
const { getPath } = require('../../config/paths')
const { dockerAdvancedManager } = require('../docker')
const { taskManager } = require('../basic/task-manager')
const manager = require('./manager')

function assertSafeIdentifier(name, field) {
  return manager && typeof manager.assertSafeIdentifier === 'function'
    ? manager.assertSafeIdentifier(name, field)
    : (function (value, label) {
        if (typeof value !== 'string' || !value) throw new Error((label || '标识符') + '不能为空')
        if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error((label || '标识符') + '仅允许字母/数字/下划线')
        return value
      })(name, field)
}

async function getTargetContainer() {
  if (manager && typeof manager.getTargetContainer === 'function') {
    return manager.getTargetContainer()
  }
  const name = 'mysql8'
  const { dockerManager } = require('../docker')
  const list = await dockerManager.listContainers(true)
  const target = list.find(c => c && c.name === name)
  if (!target) throw new Error('容器不存在')
  return { name, containerId: target.containerId }
}

async function getRootPassword() {
  if (manager && typeof manager.getRootPassword === 'function') {
    return manager.getRootPassword()
  }
  const val = process.env.MYSQL_ROOT_PASSWORD
  if (!val) throw new Error('无法获取MYSQL_ROOT_PASSWORD')
  return String(val).trim()
}

async function resolveBackupBaseByName(containerName) {
  const name = String(containerName || '').trim() || 'mysql8'
  const dir = getPath('data', 'www', name, 'backup')
  try { await fsp.mkdir(dir, { recursive: true }) } catch {}
  return dir
}

async function getBackupBaseDir() {
  const { name } = await getTargetContainer()
  return resolveBackupBaseByName(name)
}

async function resolveSelfDir(dbName) {
  const safeDb = assertSafeIdentifier(dbName, '数据库名')
  const base = await getBackupBaseDir()
  const dir = path.join(base, 'self', safeDb)
  try { await fsp.mkdir(dir, { recursive: true }) } catch {}
  return dir
}

async function resolveImportDir() {
  const base = await getBackupBaseDir()
  const dir = path.join(base, 'import')
  try { await fsp.mkdir(dir, { recursive: true }) } catch {}
  return dir
}

function buildBackupFileName(dbName, backupName) {
  const safeDb = assertSafeIdentifier(dbName, '数据库名')
  const stamp = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 14)
  const raw = String(backupName || '').trim()
  if (raw) {
    const base = raw.replace(/[^a-zA-Z0-9_]/g, '_')
    return `${base}${stamp}.sql.gz`
  }
  return `${safeDb}__${stamp}.sql.gz`
}

async function listSelfBackups(dbName) {
  const dir = await resolveSelfDir(dbName)
  try {
    const list = await fsp.readdir(dir, { withFileTypes: true })
    const items = []
    for (const d of list) {
      if (!d.isFile()) continue
      const ext = path.extname(d.name).toLowerCase()
      if (ext !== '.sql' && ext !== '.gz' && ext !== '.zip') continue
      const filePath = path.join(dir, d.name)
      let stat
      try { stat = await fsp.stat(filePath) } catch { continue }
      items.push({
        name: d.name,
        size: stat.size,
        mtime: stat.mtime.toISOString()
      })
    }
    items.sort((a, b) => a.mtime.localeCompare(b.mtime) * -1)
    return items
  } catch {
    return []
  }
}

async function listUploadedBackups() {
  const dir = await resolveImportDir()
  try {
    const list = await fsp.readdir(dir, { withFileTypes: true })
    const items = []
    for (const d of list) {
      if (!d.isFile()) continue
      const ext = path.extname(d.name).toLowerCase()
      if (ext !== '.sql' && ext !== '.gz' && ext !== '.zip') continue
      const filePath = path.join(dir, d.name)
      let stat
      try { stat = await fsp.stat(filePath) } catch { continue }
      items.push({
        name: d.name,
        size: stat.size,
        mtime: stat.mtime.toISOString()
      })
    }
    items.sort((a, b) => a.mtime.localeCompare(b.mtime) * -1)
    return items
  } catch {
    return []
  }
}

async function createDatabaseBackupAsync(dbName, backupName) {
  const safeDb = assertSafeIdentifier(dbName, '数据库名')
  const taskId = taskManager.createTask('mysql.database-backup', { dbName: safeDb, backupName: backupName ? String(backupName) : undefined })
  taskManager.executeTask(taskId, async (_id, progress, addLog) => {
    progress(5, '准备环境')
    const { name: containerName, containerId } = await getTargetContainer()
    const pwd = await getRootPassword()
    const base = await resolveBackupBaseByName(containerName)
    const dir = path.join(base, 'self', safeDb)
    try { await fsp.mkdir(dir, { recursive: true }) } catch {}
    const fileName = buildBackupFileName(safeDb, backupName)
    const filePath = path.join(dir, fileName)
    addLog(`导出数据库: ${safeDb}`)
    progress(20, '执行mysqldump')
    const containerDir = `/backup/self/${safeDb}`
    const containerFile = `${containerDir}/${fileName}`
    const cmd = ['bash', '-lc', `set -e; mkdir -p "${containerDir}" && MYSQL_PWD="${pwd}" mysqldump -uroot "${safeDb}" | gzip > "${containerFile}"`]
    const res = await dockerAdvancedManager.executeCommand(containerId, cmd, { tty: false, quiet: true, level: 'error' })
    if (!res || !res.success) {
      const out = String(res && (res.errorOutput || res.output) || '').trim()
      if (out) addLog(out)
      throw new Error(out ? `导出失败: ${out}` : '导出失败')
    }
    let stat
    try { stat = await fsp.stat(filePath) } catch { throw new Error('备份文件不存在') }
    addLog(`备份完成, 大小: ${stat.size}`)
    progress(100, '完成')
    taskManager.updateTask(taskId, { result: { success: true, data: { dbName: safeDb, fileName, size: stat.size, dir } } })
  })
  return taskId
}

async function restoreFromSelfBackupAsync(dbName, fileName) {
  const safeDb = assertSafeIdentifier(dbName, '数据库名')
  const name = String(fileName || '').trim()
  if (!name) throw new Error('文件名不能为空')
  const taskId = taskManager.createTask('mysql.database-restore-self', { dbName: safeDb, fileName: name })
  taskManager.executeTask(taskId, async (_id, progress, addLog) => {
    progress(5, '准备环境')
    const { containerId } = await getTargetContainer()
    const pwd = await getRootPassword()
    const base = await getBackupBaseDir()
    const dir = path.join(base, 'self', safeDb)
    const filePath = path.join(dir, name)
    let stat
    try { stat = await fsp.stat(filePath) } catch { throw new Error('文件不存在') }
    addLog(`开始还原, 大小: ${stat.size}`)
    progress(20, '读取备份')
    const ext = path.extname(name).toLowerCase()
    const containerDir = `/backup/self/${safeDb}`
    const containerFile = `${containerDir}/${name}`
    let importCmd
    if (ext === '.gz') {
      importCmd = `gunzip -c "${containerFile}" | MYSQL_PWD="${pwd}" mysql -uroot "${safeDb}"`
    } else {
      importCmd = `MYSQL_PWD="${pwd}" mysql -uroot "${safeDb}" < "${containerFile}"`
    }
    progress(40, '执行导入')
    const cmd = ['bash', '-lc', importCmd]
    const res = await dockerAdvancedManager.executeCommand(containerId, cmd, { tty: false, quiet: true, level: 'error' })
    if (!res || !res.success) {
      const out = String(res && (res.errorOutput || res.output) || '').trim()
      if (out) addLog(out)
      throw new Error(out ? `导入失败: ${out}` : '导入失败')
    }
    addLog('还原完成')
    progress(100, '完成')
    taskManager.updateTask(taskId, { result: { success: true, data: { dbName: safeDb, fileName: name } } })
  })
  return taskId
}

async function restoreFromUploadedBackupAsync(dbName, fileName) {
  const safeDb = assertSafeIdentifier(dbName, '数据库名')
  const name = String(fileName || '').trim()
  if (!name) throw new Error('文件名不能为空')
  const taskId = taskManager.createTask('mysql.database-restore-import', { dbName: safeDb, fileName: name })
  taskManager.executeTask(taskId, async (_id, progress, addLog) => {
    progress(5, '准备环境')
    const { containerId } = await getTargetContainer()
    const pwd = await getRootPassword()
    const base = await resolveImportDir()
    const filePath = path.join(base, name)
    let stat
    try { stat = await fsp.stat(filePath) } catch { throw new Error('文件不存在') }
    addLog(`开始导入上传备份, 大小: ${stat.size}`)
    progress(20, '读取备份')
    const ext = path.extname(name).toLowerCase()
    const containerDir = `/backup/import`
    const containerFile = `${containerDir}/${name}`
    let importCmd
    if (ext === '.gz') {
      importCmd = `gunzip -c "${containerFile}" | MYSQL_PWD="${pwd}" mysql -uroot "${safeDb}"`
    } else {
      importCmd = `MYSQL_PWD="${pwd}" mysql -uroot "${safeDb}" < "${containerFile}"`
    }
    progress(40, '执行导入')
    const cmd = ['bash', '-lc', importCmd]
    const res = await dockerAdvancedManager.executeCommand(containerId, cmd, { tty: false, quiet: true, level: 'error' })
    if (!res || !res.success) {
      const out = String(res && (res.errorOutput || res.output) || '').trim()
      if (out) addLog(out)
      throw new Error(out ? `导入失败: ${out}` : '导入失败')
    }
    addLog('导入完成')
    progress(100, '完成')
    taskManager.updateTask(taskId, { result: { success: true, data: { dbName: safeDb, fileName: name } } })
  })
  return taskId
}

module.exports = {
  createDatabaseBackupAsync,
  resolveSelfDir,
  listSelfBackups,
  listUploadedBackups,
  restoreFromSelfBackupAsync,
  restoreFromUploadedBackupAsync
}

