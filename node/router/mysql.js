const express = require('express');
const router = express.Router();
const log = require('../function/basic/log');
const { isSafeIdentifier } = require('../function/basic/identifier');
const { validateFileName } = require('../function/file/path-utils');
const { validateDbIdentifier, handleRootAuthError } = require('../function/router/validator');
const { createDatabase, listDatabases, deleteDatabase, updateDatabasePassword, syncDatabasesFromServer, testRootConnection } = require('../function/mysql/manager');
const { changeRootPasswordAsync, getMysqlLogs, updatePerformanceSettings, getCurrentPerformanceSettings, getServiceStatus } = require('../function/mysql/admin');
const { createDatabaseBackupAsync, listSelfBackups, listUploadedBackups, restoreFromSelfBackupAsync, restoreFromUploadedBackupAsync } = require('../function/mysql/backup');

router.get('/databases', async (_req, res) => {
  try {
    const data = await Promise.resolve(listDatabases());
    res.json({ success: true, data });
  } catch (error) {
    log.error('获取数据库列表', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '获取数据库列表失败', error: error.message });
  }
});

router.post('/databases', async (req, res) => {
  try {
    const { dbName, userName, password, charset = 'utf8mb4', collate = 'utf8mb4_0900_ai_ci' } = req.body || {};
    if (!dbName || !userName || !password) {
      log.warning('创建数据库', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const validation = validateDbIdentifier(dbName, userName);
    if (!validation.valid) {
      log.warning('创建数据库', '标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '数据库名或用户名不合法' });
    }
    await Promise.resolve(testRootConnection());
    const item = await Promise.resolve(createDatabase({ dbName, userName, password, charset, collate }));
    log.info('创建数据库', JSON.stringify({ dbName, userName })).catch(() => {});
    res.json({ success: true, message: '创建成功', data: item });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('创建数据库', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '创建数据库失败：' + authError.friendly, error: authError.detail });
    }
    if (/(已存在)/.test(msg)) {
      return res.status(409).json({ success: false, message: msg, error: msg });
    }
    res.status(500).json({ success: false, message: '创建数据库失败', error: msg });
  }
});

router.delete('/databases/:dbName', async (req, res) => {
  try {
    const dbName = req.params && req.params.dbName;
    const userName = (req.query && req.query.userName) || (req.body && req.body.userName) || '';
    const dropUser = (req.query && String(req.query.dropUser).toLowerCase() === 'false') ? false : true;
    if (!dbName) {
      log.warning('删除数据库', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const validation = validateDbIdentifier(dbName, userName);
    if (!validation.valid) {
      log.warning('删除数据库', '标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '数据库名或用户名不合法' });
    }
    await Promise.resolve(testRootConnection());
    const result = await Promise.resolve(deleteDatabase({ dbName, userName, dropUser }));
    log.info('删除数据库', JSON.stringify({ dbName, userName: result.userName, droppedUser: result.droppedUser })).catch(() => {});
    res.json({ success: true, message: '删除成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('删除数据库', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '删除数据库失败：' + authError.friendly, error: authError.detail });
    }
    res.status(500).json({ success: false, message: '删除数据库失败', error: msg });
  }
});

router.post('/databases/sync', async (_req, res) => {
  try {
    await Promise.resolve(testRootConnection());
    const result = await Promise.resolve(syncDatabasesFromServer());
    res.json({ success: true, message: '同步完成', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('同步数据库', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '数据库同步失败：' + authError.friendly, error: authError.detail });
    }
    res.status(500).json({ success: false, message: '数据库同步失败', error: msg });
  }
});

router.put('/databases/:dbName/password', async (req, res) => {
  try {
    const dbName = req.params && req.params.dbName;
    const userName = (req.body && req.body.userName) || (req.query && req.query.userName) || '';
    const password = req.body && req.body.password;
    if (!dbName || !password) {
      log.warning('修改密码', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const validation = validateDbIdentifier(dbName, userName);
    if (!validation.valid) {
      log.warning('修改密码', '标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '数据库名或用户名不合法' });
    }
    await Promise.resolve(testRootConnection());
    const result = await Promise.resolve(updateDatabasePassword({ dbName, userName, password }));
    log.info('修改密码', JSON.stringify({ dbName, userName: result.userName, updatedAt: result.updatedAt })).catch(() => {});
    res.json({ success: true, message: '密码更新成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('修改密码', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '更新密码失败：' + authError.friendly, error: authError.detail });
    }
    res.status(500).json({ success: false, message: '更新密码失败', error: msg });
  }
});

router.post('/databases/:dbName/backup', async (req, res) => {
  try {
    const dbName = req.params && req.params.dbName;
    if (!dbName) {
      log.warning('创建备份', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    if (!isSafeIdentifier(dbName)) {
      log.warning('创建备份', '标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '数据库名不合法' });
    }
    await Promise.resolve(testRootConnection());
    const taskId = await Promise.resolve(createDatabaseBackupAsync(dbName));
    log.info('创建备份', JSON.stringify({ dbName, taskId })).catch(() => {});
    res.json({ success: true, message: '备份任务已创建', data: { taskId } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('创建备份', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '创建备份失败：' + authError.friendly, error: authError.detail });
    }
    res.status(500).json({ success: false, message: '创建备份失败', error: msg });
  }
});

router.get('/databases/:dbName/backups', async (req, res) => {
  try {
    const dbName = req.params && req.params.dbName;
    if (!dbName) {
      log.warning('获取备份列表', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    if (!isSafeIdentifier(dbName)) {
      log.warning('获取备份列表', '标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '数据库名不合法' });
    }
    const self = await Promise.resolve(listSelfBackups(dbName));
    const upload = await Promise.resolve(listUploadedBackups());
    res.json({ success: true, data: { self, upload } });
  } catch (error) {
    log.error('获取备份列表', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '获取备份列表失败', error: error.message });
  }
});

router.post('/databases/:dbName/backups/self/:fileName/restore', async (req, res) => {
  try {
    const dbName = req.params && req.params.dbName;
    const fileName = req.params && req.params.fileName;
    if (!dbName || !fileName) {
      log.warning('还原备份', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    if (!isSafeIdentifier(dbName)) {
      log.warning('还原备份', '标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '数据库名不合法' });
    }
    if (!validateFileName(fileName)) {
      log.warning('还原备份', '文件名不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '备份文件名不合法' });
    }
    await Promise.resolve(testRootConnection());
    const taskId = await Promise.resolve(restoreFromSelfBackupAsync(dbName, fileName));
    log.info('还原备份', JSON.stringify({ dbName, fileName, taskId })).catch(() => {});
    res.json({ success: true, message: '还原任务已创建', data: { taskId } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('还原备份', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '还原备份失败：' + authError.friendly, error: authError.detail });
    }
    res.status(500).json({ success: false, message: '还原备份失败', error: msg });
  }
});

router.post('/databases/:dbName/backups/import/:fileName/restore', async (req, res) => {
  try {
    const dbName = req.params && req.params.dbName;
    const fileName = req.params && req.params.fileName;
    if (!dbName || !fileName) {
      log.warning('导入备份', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    if (!isSafeIdentifier(dbName)) {
      log.warning('导入备份', '标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '数据库名不合法' });
    }
    if (!validateFileName(fileName)) {
      log.warning('导入备份', '文件名不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '备份文件名不合法' });
    }
    await Promise.resolve(testRootConnection());
    const taskId = await Promise.resolve(restoreFromUploadedBackupAsync(dbName, fileName));
    log.info('导入备份', JSON.stringify({ dbName, fileName, taskId })).catch(() => {});
    res.json({ success: true, message: '导入备份任务已创建', data: { taskId } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('导入备份', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '导入备份失败：' + authError.friendly, error: authError.detail });
    }
    res.status(500).json({ success: false, message: '导入备份失败', error: msg });
  }
});

router.post('/admin/root-password', async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword) {
      log.warning('修改root密码', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const pwd = String(newPassword || '');
    if (pwd.length < 8 || /\s/.test(pwd)) {
      log.warning('修改root密码', '密码格式不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '密码格式不合法，至少8位且不包含空白字符' });
    }
    const result = await Promise.resolve(changeRootPasswordAsync(String(newPassword)));
    log.info('修改root密码', JSON.stringify({ taskId: result.taskId })).catch(() => {});
    res.json({ success: true, message: 'root密码更新任务已创建', data: result });
  } catch (error) {
    log.error('修改root密码', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: 'root密码更新失败', error: error.message });
  }
});

router.get('/admin/logs', async (req, res) => {
  try {
    const { parseIntInRange, parseBooleanLike } = require('../function/basic/number-boolean');
    const tailRaw = req.query && req.query.tail;
    const sinceRaw = req.query && req.query.since;
    const timestampsRaw = req.query && req.query.timestamps;
    const tail = tailRaw !== undefined ? parseIntInRange(tailRaw, { min: 0, max: 10000, defaultValue: undefined }) : undefined;
    const since = sinceRaw !== undefined ? parseIntInRange(sinceRaw, { min: 0, max: Number.MAX_SAFE_INTEGER, defaultValue: undefined }) : undefined;
    const timestamps = timestampsRaw !== undefined ? parseBooleanLike(timestampsRaw, true) : undefined;
    const result = await Promise.resolve(getMysqlLogs({ tail, since, timestamps }));
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('获取日志', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '获取日志失败', error: error.message });
  }
});

router.put('/admin/performance', async (req, res) => {
  try {
    const settings = req.body && typeof req.body === 'object' ? req.body : {};
    const persist = req.query && req.query.persist !== undefined ? String(req.query.persist).toLowerCase() !== 'false' : true;
    await Promise.resolve(testRootConnection());
    const result = await Promise.resolve(updatePerformanceSettings(settings, persist));
    log.info('更新性能参数', JSON.stringify({ updated: result.updated, persist: result.persist })).catch(() => {});
    res.json({ success: true, message: '性能参数更新成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('更新性能参数', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '性能参数更新失败：' + authError.friendly, error: authError.detail });
    }
    res.status(500).json({ success: false, message: '性能参数更新失败', error: msg });
  }
});

router.get('/admin/performance', async (_req, res) => {
  try {
    await Promise.resolve(testRootConnection());
    const result = await Promise.resolve(getCurrentPerformanceSettings());
    res.json({ success: true, data: result.data });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取性能参数', msg).catch(() => {});
    const authError = handleRootAuthError(msg);
    if (authError) {
      return res.status(500).json({ success: false, message: '查询性能参数失败：' + authError.friendly, error: authError.detail });
    }
    res.status(500).json({ success: false, message: '查询性能参数失败', error: msg });
  }
});

router.get('/admin/status', async (_req, res) => {
  try {
    const result = await Promise.resolve(getServiceStatus());
    res.json({ success: true, data: { status: result && result.status || '' } });
  } catch (error) {
    log.error('获取状态', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '获取状态失败', error: error.message });
  }
});

module.exports = router;
