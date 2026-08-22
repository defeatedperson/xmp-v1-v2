const express = require('express');
const router = express.Router();
const log = require('../function/basic/log');
const { validatePhpContainerName } = require('../function/router/validator');
const { installPhpAsync } = require('../function/php/create');
const { getActiveExtensions, installExtensionAsync, disableExtensionAsync } = require('../function/php/admin');
const { getPhpSettings, updatePhpSettings } = require('../function/php/settings');
const { getFpmSettings, updateFpmSettings } = require('../function/php/fpm');
const { getSoExtensions, operateSoExtensionAsync } = require('../function/php/so-extensions');

router.post('/install', async (req, res) => {
  try {
    const body = req.body || {};
    const image = typeof body.image === 'string' ? body.image.trim() : '';
    const containerName = typeof body.containerName === 'string' ? body.containerName.trim() : '';
    const portValue = body.port;
    if (!image) {
      return res.status(400).json({ success: false, message: '镜像名不能为空' });
    }
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    const port = Number(portValue);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return res.status(400).json({ success: false, message: '端口必须是1-65535之间的整数' });
    }
    const taskId = installPhpAsync(image, containerName, port);
    log.info('安装PHP', JSON.stringify({ image, containerName, port, taskId })).catch(() => {});
    res.json({ success: true, message: 'PHP安装任务已创建', data: { taskId } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('安装PHP', msg).catch(() => {});
    res.status(500).json({ success: false, message: '创建PHP安装任务失败', error: msg });
  }
});

router.get('/extensions/active', async (req, res) => {
  try {
    const containerName = typeof req.query.containerName === 'string' ? req.query.containerName.trim() : '';
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    const data = await getActiveExtensions(containerName);
    res.json({ success: true, data });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取PHP扩展', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取PHP扩展列表失败', error: msg });
  }
});

router.post('/extensions/install', async (req, res) => {
  try {
    const body = req.body || {};
    const containerName = typeof body.containerName === 'string' ? body.containerName.trim() : '';
    const extension = typeof body.extension === 'string' ? body.extension.trim() : '';
    const modeRaw = typeof body.mode === 'string' ? body.mode.trim() : '';
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    if (!extension) {
      return res.status(400).json({ success: false, message: '扩展名称不能为空' });
    }
    if (!/^[A-Za-z0-9_]{1,64}$/.test(extension)) {
      return res.status(400).json({ success: false, message: '扩展名称格式无效' });
    }
    if (!modeRaw) {
      return res.status(400).json({ success: false, message: '模式不能为空' });
    }
    const mode = modeRaw.toLowerCase();
    if (mode !== 'core' && mode !== 'pecl') {
      return res.status(400).json({ success: false, message: '模式必须是core或pecl' });
    }
    const result = await installExtensionAsync(containerName, extension, mode);
    log.info('安装PHP扩展', JSON.stringify({ containerName, extension, mode, result })).catch(() => {});
    res.json({ success: true, message: 'PHP扩展已更新并重启', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('安装PHP扩展', msg).catch(() => {});
    res.status(500).json({ success: false, message: '更新PHP扩展失败', error: msg });
  }
});

router.get('/extensions/so', async (req, res) => {
  try {
    const containerName = typeof req.query.containerName === 'string' ? req.query.containerName.trim() : '';
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    const data = await getSoExtensions(containerName);
    res.json({ success: true, message: '获取PHP自定义扩展配置成功', data });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取SO扩展列表', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取PHP自定义扩展配置失败', error: msg });
  }
});

router.post('/extensions/so', async (req, res) => {
  try {
    const body = req.body || {};
    const containerName = typeof body.containerName === 'string' ? body.containerName.trim() : '';
    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    const actionRaw = typeof body.action === 'string' ? body.action.trim() : '';
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    if (!filename) {
      return res.status(400).json({ success: false, message: '扩展文件名不能为空' });
    }
    if (!/^[A-Za-z0-9_.-]{1,128}\.so$/.test(filename)) {
      return res.status(400).json({ success: false, message: '扩展文件名格式无效，必须是类似redis.so的文件名' });
    }
    if (!actionRaw) {
      return res.status(400).json({ success: false, message: '操作方式不能为空' });
    }
    const result = await operateSoExtensionAsync(containerName, filename, actionRaw);
    log.info('操作SO扩展', JSON.stringify({ containerName, filename, action: result && result.action, restarted: !!(result && result.restarted) })).catch(() => {});
    const opText = result && result.action === 'remove' ? '移除' : '添加';
    res.json({ success: true, message: `PHP自定义扩展已${opText}并重启`, data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('操作SO扩展', msg).catch(() => {});
    if (msg === '扩展尚未添加，无需移除' || msg === '扩展文件不存在，请先将.so文件放入ext目录' || msg === '操作方式必须是添加或移除') {
      res.status(400).json({ success: false, message: msg });
    } else {
      res.status(500).json({ success: false, message: '操作PHP自定义扩展失败', error: msg });
    }
  }
});

router.post('/extensions/disable', async (req, res) => {
  try {
    const body = req.body || {};
    const containerName = typeof body.containerName === 'string' ? body.containerName.trim() : '';
    const extension = typeof body.extension === 'string' ? body.extension.trim() : '';
    const modeRaw = typeof body.mode === 'string' ? body.mode.trim() : '';
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    if (!extension) {
      return res.status(400).json({ success: false, message: '扩展名称不能为空' });
    }
    if (!/^[A-Za-z0-9_]{1,64}$/.test(extension)) {
      return res.status(400).json({ success: false, message: '扩展名称格式无效' });
    }
    if (!modeRaw) {
      return res.status(400).json({ success: false, message: '模式不能为空' });
    }
    const mode = modeRaw.toLowerCase();
    if (mode !== 'core' && mode !== 'pecl') {
      return res.status(400).json({ success: false, message: '模式必须是core或pecl' });
    }
    const result = await disableExtensionAsync(containerName, extension, mode);
    log.info('禁用PHP扩展', JSON.stringify({ containerName, extension, mode, result })).catch(() => {});
    res.json({ success: true, message: 'PHP扩展已禁用并重启', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('禁用PHP扩展', msg).catch(() => {});
    if (msg === '此扩展是核心自带扩展，无法禁用') {
      res.status(400).json({ success: false, message: msg });
    } else {
      res.status(500).json({ success: false, message: '禁用PHP扩展失败', error: msg });
    }
  }
});

router.get('/settings', async (req, res) => {
  try {
    const containerName = typeof req.query.containerName === 'string' ? req.query.containerName.trim() : '';
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    let keys;
    const keysRaw = typeof req.query.keys === 'string' ? req.query.keys.trim() : '';
    if (keysRaw) {
      keys = keysRaw.split(',').map(s => s.trim()).filter(Boolean);
    }
    const result = await getPhpSettings(containerName, keys);
    const isDefault = !!(result && result.isDefault);
    const message = isDefault ? '当前为默认配置' : '获取PHP配置成功';
    res.json({ success: true, message, data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取PHP配置', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取PHP配置失败', error: msg });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const containerName = typeof body.containerName === 'string' ? body.containerName.trim() : '';
    const settings = body.settings && typeof body.settings === 'object' ? body.settings : null;
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: '配置参数无效' });
    }
    const result = await updatePhpSettings(containerName, settings);
    log.info('更新PHP配置', JSON.stringify({ containerName, updated: Array.isArray(result && result.updatedKeys) ? result.updatedKeys.length : 0, restarted: !!(result && result.restarted) })).catch(() => {});
    res.json({ success: true, message: 'PHP配置已更新并重载', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('更新PHP配置', msg).catch(() => {});
    res.status(500).json({ success: false, message: '更新PHP配置失败', error: msg });
  }
});

router.get('/fpm/settings', async (req, res) => {
  try {
    const containerName = typeof req.query.containerName === 'string' ? req.query.containerName.trim() : '';
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    let keys;
    const keysRaw = typeof req.query.keys === 'string' ? req.query.keys.trim() : '';
    if (keysRaw) {
      keys = keysRaw.split(',').map(s => s.trim()).filter(Boolean);
    }
    const result = await getFpmSettings(containerName, keys);
    const isDefault = !!(result && result.isDefault);
    const message = isDefault ? '当前为默认配置' : '获取PHP-FPM配置成功';
    res.json({ success: true, message, data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取PHP-FPM配置', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取PHP-FPM配置失败', error: msg });
  }
});

router.put('/fpm/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const containerName = typeof body.containerName === 'string' ? body.containerName.trim() : '';
    const settings = body.settings && typeof body.settings === 'object' ? body.settings : null;
    if (!containerName) {
      return res.status(400).json({ success: false, message: '容器名不能为空' });
    }
    const containerValidation = validatePhpContainerName(containerName);
    if (!containerValidation.valid) {
      return res.status(400).json({ success: false, message: '容器名必须是php+2位数字' });
    }
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: '配置参数无效' });
    }
    const result = await updateFpmSettings(containerName, settings);
    log.info('更新PHP-FPM配置', JSON.stringify({ containerName, updated: Array.isArray(result && result.updatedKeys) ? result.updatedKeys.length : 0, restarted: !!(result && result.restarted) })).catch(() => {});
    res.json({ success: true, message: 'PHP-FPM配置已更新并重载', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('更新PHP-FPM配置', msg).catch(() => {});
    res.status(500).json({ success: false, message: '更新PHP-FPM配置失败', error: msg });
  }
});

module.exports = router;

