const express = require('express');
const router = express.Router();
const { createDaemonClient } = require('../function/basic/daemon-client');
const log = require('../function/basic/log');

router.get('/version', (req, res) => {
  return res.json({ version: 'xmp-node v2.0.1' });
});

router.post('/daemon/restart-self', async (_req, res) => {
  try {
    const daemonClient = createDaemonClient({ service: 'node-agent' });
    const ok = await daemonClient.restartSelf();
    if (!ok) {
      log.error('重启守护进程', 'restart request failed').catch(() => {});
      return res.status(500).json({ success: false, message: '重启请求提交失败' });
    }
    log.info('重启守护进程', 'restart request submitted').catch(() => {});
    return res.json({ success: true, message: '重启请求已提交' });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('重启守护进程', msg).catch(() => {});
    return res.status(500).json({ success: false, message: '重启请求提交失败', error: msg });
  }
});

router.get('/daemon/log', async (req, res) => {
  try {
    const tailLinesRaw = req.query && (req.query.tailLines || req.query.tail || req.query.lines);
    const tailLines = Number.isFinite(Number(tailLinesRaw)) ? Math.max(1, Math.floor(Number(tailLinesRaw))) : 200;

    const daemonClient = createDaemonClient({ service: 'node-agent' });
    const r = await daemonClient.readDaemonLog({ tailLines });
    if (!r.exists) {
      log.error('获取守护进程日志', 'log file not found').catch(() => {});
      return res.status(500).json({ success: false, message: '守护进程日志获取失败' });
    }
    return res.json({ success: true, data: { path: r.path, lines: r.lines } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取守护进程日志', msg).catch(() => {});
    return res.status(500).json({ success: false, message: '守护进程日志获取失败', error: msg });
  }
});

router.post('/daemon/check-web-perm', async (_req, res) => {
  try {
    const daemonClient = createDaemonClient({ service: 'node-agent' });
    const ok = await daemonClient.checkWebPerm();
    if (!ok) {
      log.error('检查网站权限', 'check web perm request failed').catch(() => {});
      return res.status(500).json({ success: false, message: '目录权限修复请求提交失败' });
    }
    log.info('检查网站权限', 'check web perm request submitted').catch(() => {});
    return res.json({ success: true, message: '目录权限修复请求已提交' });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('检查网站权限', msg).catch(() => {});
    return res.status(500).json({ success: false, message: '目录权限修复请求提交失败', error: msg });
  }
});

module.exports = router;
