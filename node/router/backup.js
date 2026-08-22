const express = require('express')
const router = express.Router()
const { backupManager, restoreManager, websiteBackupManager, websiteRestoreManager } = require('../function/backup')
const log = require('../function/basic/log')
const { isValidDockerIdentifier } = require('../function/basic/docker-identifier')
const { validateFileName } = require('../function/file/path-utils')
const { validateDomainName } = require('../function/router/validator')

router.post('/containers/:id/backup', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim()
    if (!isValidDockerIdentifier(id)) {
      log.warning('创建容器备份', '容器标识不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '容器标识不合法' })
    }
    const { backupName = '' } = req.body || {}
    if (backupName && !validateFileName(backupName)) {
      log.warning('创建容器备份', '备份名称不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '备份名称不合法' })
    }
    const taskId = await backupManager.createBackupAsync(id, backupName)
    log.info('创建容器备份', JSON.stringify({ id, backupName, taskId })).catch(() => {})
    res.json({ success: true, message: '备份任务已创建', data: { taskId } })
  } catch (error) {
    log.error('创建容器备份', String(error && error.message || 'error')).catch(() => {})
    const msg = String(error && error.message || '')
    if (msg.includes('已达备份上限')) {
      return res.status(409).json({ success: false, message: '创建备份失败', error: msg })
    }
    if (msg.includes('源目录为空') || msg.includes('无文件')) {
      return res.status(400).json({ success: false, message: '创建备份失败', error: msg })
    }
    res.status(500).json({ success: false, message: '创建备份失败', error: msg })
  }
})

router.get('/containers/:name/list', async (req, res) => {
  try {
    const name = String(req.params && req.params.name || '').trim()
    if (!isValidDockerIdentifier(name)) {
      log.warning('获取容器备份列表', '容器标识不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '容器标识不合法' })
    }
    const list = await backupManager.listBackups(name)
    res.json({ success: true, data: list })
  } catch (error) {
    log.error('获取容器备份列表', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({ success: false, message: '获取备份列表失败', error: error.message })
  }
})

router.delete('/containers/:name/:backupName', async (req, res) => {
  try {
    const name = String(req.params && req.params.name || '').trim()
    if (!isValidDockerIdentifier(name)) {
      log.warning('删除容器备份', '容器标识不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '容器标识不合法' })
    }
    const backupName = String(req.params && req.params.backupName || '').trim()
    if (!validateFileName(backupName)) {
      log.warning('删除容器备份', '备份名称不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '备份名称不合法' })
    }
    const result = await backupManager.deleteBackup(name, backupName)
    if (result.success) {
      log.info('删除容器备份', JSON.stringify({ name, backupName })).catch(() => {})
      return res.json(result)
    }
    log.warning('删除容器备份', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error || '删除失败' })
  } catch (error) {
    log.error('删除容器备份', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({ success: false, message: '删除备份失败', error: error.message })
  }
})

router.post('/containers/:name/:backupName/restore', async (req, res) => {
  try {
    const name = String(req.params && req.params.name || '').trim()
    if (!isValidDockerIdentifier(name)) {
      log.warning('还原容器备份', '容器标识不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '容器标识不合法' })
    }
    const backupName = String(req.params && req.params.backupName || '').trim()
    if (!validateFileName(backupName)) {
      log.warning('还原容器备份', '备份名称不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '备份名称不合法' })
    }
    const { dataOnly = true, restart = true } = req.body || {}
    const taskId = await restoreManager.restoreBackupAsync(name, backupName, { dataOnly: Boolean(dataOnly), restart: Boolean(restart) })
    log.info('还原容器备份', JSON.stringify({ name, backupName, dataOnly: Boolean(dataOnly), taskId })).catch(() => {})
    res.json({ success: true, message: '还原任务已创建', data: { taskId } })
  } catch (error) {
    log.error('还原容器备份', String(error && error.message || 'error')).catch(() => {})
    const msg = String(error && error.message || '')
    if (msg.includes('不支持Docker volume')) {
      return res.status(409).json({ success: false, message: '还原备份失败', error: msg })
    }
    if (msg.includes('卷路径不在受管目录')) {
      return res.status(400).json({ success: false, message: '还原备份失败', error: msg })
    }
    res.status(500).json({ success: false, message: '还原备份失败', error: msg })
  }
})

router.get('/websites/:domain/list', async (req, res) => {
  try {
    const domain = String(req.params && req.params.domain || '').trim()
    const domainCheck = validateDomainName(domain)
    if (!domainCheck.valid) {
      log.warning('获取网站备份列表', '域名不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '域名不合法' })
    }
    const list = await websiteBackupManager.listBackups(domain)
    res.json({ success: true, data: list })
  } catch (error) {
    log.error('获取网站备份列表', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({ success: false, message: '获取备份列表失败', error: error.message })
  }
})

router.post('/websites/:domain/backup', async (req, res) => {
  try {
    const domain = String(req.params && req.params.domain || '').trim()
    const domainCheck = validateDomainName(domain)
    if (!domainCheck.valid) {
      log.warning('创建网站备份', '域名不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '域名不合法' })
    }
    const { backupName = '' } = req.body || {}
    if (backupName && !validateFileName(String(backupName))) {
      log.warning('创建网站备份', '备份名称不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '备份名称不合法' })
    }
    const taskId = await websiteBackupManager.createBackupAsync(domain, backupName)
    log.info('创建网站备份', JSON.stringify({ domain, backupName, taskId })).catch(() => {})
    res.json({ success: true, message: '备份任务已创建', data: { taskId } })
  } catch (error) {
    log.error('创建网站备份', String(error && error.message || 'error')).catch(() => {})
    const msg = String(error && error.message || '')
    if (msg.includes('已达备份上限')) {
      return res.status(409).json({ success: false, message: '创建备份失败', error: msg })
    }
    if (msg.includes('已存在')) {
      return res.status(409).json({ success: false, message: '创建备份失败', error: msg })
    }
    if (msg.includes('不存在') || msg.includes('无文件') || msg.includes('为空')) {
      return res.status(400).json({ success: false, message: '创建备份失败', error: msg })
    }
    res.status(500).json({ success: false, message: '创建备份失败', error: msg })
  }
})

router.delete('/websites/:domain/:backupFile', async (req, res) => {
  try {
    const domain = String(req.params && req.params.domain || '').trim()
    const domainCheck = validateDomainName(domain)
    if (!domainCheck.valid) {
      log.warning('删除网站备份', '域名不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '域名不合法' })
    }
    const backupFile = String(req.params && req.params.backupFile || '').trim()
    if (!validateFileName(backupFile)) {
      log.warning('删除网站备份', '备份文件名不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '备份文件名不合法' })
    }
    const result = await websiteBackupManager.deleteBackup(domain, backupFile)
    if (result.success) {
      log.info('删除网站备份', JSON.stringify({ domain, backupFile })).catch(() => {})
      return res.json(result)
    }
    log.warning('删除网站备份', String(result.error || 'bad request')).catch(() => {})
    return res.status(400).json({ success: false, error: result.error || '删除失败' })
  } catch (error) {
    log.error('删除网站备份', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({ success: false, message: '删除备份失败', error: error.message })
  }
})

router.post('/websites/:domain/:backupFile/restore', async (req, res) => {
  try {
    const domain = String(req.params && req.params.domain || '').trim()
    const domainCheck = validateDomainName(domain)
    if (!domainCheck.valid) {
      log.warning('还原网站备份', '域名不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '域名不合法' })
    }
    const backupFile = String(req.params && req.params.backupFile || '').trim()
    if (!validateFileName(backupFile)) {
      log.warning('还原网站备份', '备份文件名不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '备份文件名不合法' })
    }
    const taskId = await websiteRestoreManager.restoreBackupAsync(domain, backupFile)
    log.info('还原网站备份', JSON.stringify({ domain, backupFile, taskId })).catch(() => {})
    res.json({ success: true, message: '还原任务已创建', data: { taskId } })
  } catch (error) {
    log.error('还原网站备份', String(error && error.message || 'error')).catch(() => {})
    const msg = String(error && error.message || '')
    if (msg.includes('不存在')) {
      return res.status(404).json({ success: false, message: '还原备份失败', error: msg })
    }
    if (msg.includes('不支持') || msg.includes('格式')) {
      return res.status(400).json({ success: false, message: '还原备份失败', error: msg })
    }
    res.status(500).json({ success: false, message: '还原备份失败', error: msg })
  }
})

router.get('/import/list', async (_req, res) => {
  try {
    const { getPath } = require('../config/paths')
    const fs = require('fs')
    const fsp = require('fs').promises
    const path = require('path')
    const base = getPath('data','www','backup','import')
    try { fs.mkdirSync(base, { recursive: true }) } catch {}
    const list = await fsp.readdir(base, { withFileTypes: true })
    const data = list.filter(d => d.isDirectory()).map(d => ({ name: d.name, path: path.join('/backup/import', d.name) }))
    res.json({ success: true, data })
  } catch (error) {
    log.error('获取导入列表', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({ success: false, message: '获取导入列表失败', error: error.message })
  }
})

router.post('/import/:backupName/restore', async (req, res) => {
  try {
    const { backupName } = req.params
    const safeBackupName = String(backupName || '').trim()
    if (!validateFileName(safeBackupName)) {
      log.warning('导入还原备份', '备份名称不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '备份名称不合法' })
    }
    const { getPath } = require('../config/paths')
    const dir = getPath('data','www','backup','import', safeBackupName)
    const fsp = require('fs').promises
    const path = require('path')
    const mf = path.join(dir, 'manifest.json')
    const json = await fsp.readFile(mf, 'utf8')
    const manifest = JSON.parse(json)
    const finalName = String(manifest && manifest.name || '').trim()
    if (!finalName) return res.status(400).json({ success: false, error: '缺少容器名称' })
    if (!isValidDockerIdentifier(finalName)) {
      log.warning('导入还原备份', '容器标识不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '容器标识不合法' })
    }
    const taskId = await restoreManager.restoreBackupAsync(finalName, safeBackupName, { dataOnly: false, strict: true, importDir: true })
    log.info('导入还原备份', JSON.stringify({ backupName: safeBackupName, name: finalName, taskId })).catch(() => {})
    res.json({ success: true, message: '导入还原任务已创建', data: { taskId } })
  } catch (error) {
    log.error('导入还原备份', String(error && error.message || 'error')).catch(() => {})
    const msg = String(error && error.message || '')
    if (msg.includes('不支持Docker volume')) {
      return res.status(409).json({ success: false, message: '导入还原失败', error: msg })
    }
    if (msg.includes('卷路径不在受管目录')) {
      return res.status(400).json({ success: false, message: '导入还原失败', error: msg })
    }
    res.status(500).json({ success: false, message: '导入还原失败', error: msg })
  }
})

module.exports = router
