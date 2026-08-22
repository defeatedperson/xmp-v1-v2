const express = require('express');
const router = express.Router();
const log = require('../function/basic/log');
const { getServiceStatus, getRedisInfo, changePassword, clearCache } = require('../function/redis/admin');

router.get('/admin/status', async (_req, res) => {
  try {
    const result = await Promise.resolve(getServiceStatus());
    res.json({ success: true, data: { status: result && result.status || '', message: result && result.message || '' } });
  } catch (error) {
    log.error('获取Redis状态', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '获取Redis状态失败', error: error.message });
  }
});

router.get('/admin/info', async (_req, res) => {
  try {
    const info = await Promise.resolve(getRedisInfo());
    res.json({ success: true, data: info });
  } catch (error) {
    log.error('获取Redis信息', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '获取Redis信息失败', error: error.message });
  }
});

router.post('/admin/password', async (req, res) => {
  try {
    const newPassword = req.body && req.body.newPassword;
    if (!newPassword) {
      log.warning('修改密码', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const pwd = String(newPassword || '');
    if (pwd.length < 8 || /\s/.test(pwd)) {
      log.warning('修改密码', '密码格式不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '密码格式不合法，至少8位且不包含空白字符' });
    }
    await Promise.resolve(changePassword(pwd));
    log.info('修改密码', '密码更新成功').catch(() => {});
    res.json({ success: true, message: '密码更新成功' });
  } catch (error) {
    log.error('修改密码', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '密码更新失败', error: error.message });
  }
});

router.post('/admin/flush', async (_req, res) => {
  try {
    await Promise.resolve(clearCache());
    log.info('清空缓存', '缓存清空成功').catch(() => {});
    res.json({ success: true, message: '缓存清空成功' });
  } catch (error) {
    log.error('清空缓存', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '清空缓存失败', error: error.message });
  }
});

module.exports = router;

