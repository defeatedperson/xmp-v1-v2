const express = require('express');
const router = express.Router();
const log = require('../function/basic/log');
const { taskManager } = require('../function/basic/task-manager');
const { reloadOpenresty, startOpenresty, stopOpenresty, getOpenrestyStatus } = require('../function/website/openresty');
const { isValidDomainName } = require('../function/basic/domain');
const {
  issueInitialCert,
  getCertIndex,
  getCertMeta,
  getCertPublicPem,
  getCertPrivatePem,
  repairCertIndex,
  updateCertMeta,
  uploadCert,
  deleteCert
} = require('../function/website/ssl-cert');

router.get('/openresty/status', async (_req, res) => {
  try {
    const result = await Promise.resolve(getOpenrestyStatus());
    res.json({ success: true, data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('OpenResty状态', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取openresty状态失败', error: msg });
  }
});

router.post('/openresty/reload', async (_req, res) => {
  try {
    const result = await Promise.resolve(reloadOpenresty());
    log.info('重载OpenResty', JSON.stringify({ containerId: result && result.containerId })).catch(() => {});
    res.json({ success: true, message: '重载成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('重载OpenResty', msg).catch(() => {});
    res.status(500).json({ success: false, message: '重载openresty失败', error: msg });
  }
});

router.post('/openresty/start', async (_req, res) => {
  try {
    const result = await Promise.resolve(startOpenresty());
    log.info('启动OpenResty', JSON.stringify({ containerId: result && result.containerId, message: result && result.message })).catch(() => {});
    res.json({ success: true, message: '操作成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('启动OpenResty', msg).catch(() => {});
    res.status(500).json({ success: false, message: '启动openresty失败', error: msg });
  }
});

router.post('/openresty/stop', async (_req, res) => {
  try {
    const result = await Promise.resolve(stopOpenresty());
    log.info('停止OpenResty', JSON.stringify({ containerId: result && result.containerId, message: result && result.message })).catch(() => {});
    res.json({ success: true, message: '操作成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('停止OpenResty', msg).catch(() => {});
    res.status(500).json({ success: false, message: '停止openresty失败', error: msg });
  }
});

router.post('/ssl/issue-initial', async (req, res) => {
  try {
    const body = req.body || {};
    const certName = String(body.certName || '').trim();
    const email = String(body.email || '').trim();
    const remark = String(body.remark || '').trim();
    let domains = [];
    if (Array.isArray(body.domains)) {
      for (const v of body.domains) {
        const s = String(v || '').trim();
        if (!s) continue;
        if (!isValidDomainName(s)) {
          log.warning('申请证书', '域名格式无效').catch(() => {});
          return res.status(400).json({ success: false, message: '域名格式无效' });
        }
        domains.push(s);
      }
    } else if (body.domains !== undefined && body.domains !== null) {
      const s = String(body.domains || '');
      for (const part of s.split(',')) {
        const t = part.trim();
        if (!t) continue;
        if (!isValidDomainName(t)) {
          log.warning('申请证书', '域名格式无效').catch(() => {});
          return res.status(400).json({ success: false, message: '域名格式无效' });
        }
        domains.push(t);
      }
    }
    const autoRenewRaw = body.autoRenew;
    const autoRenew = autoRenewRaw === undefined || autoRenewRaw === null ? true : !!autoRenewRaw;
    if (!certName || !email || !domains.length) {
      log.warning('申请证书', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(certName)) {
      log.warning('申请证书', '证书名包含非法字符').catch(() => {});
      return res.status(400).json({ success: false, message: '证书名包含非法字符' });
    }
    const taskId = taskManager.createTask('ssl.issueInitial', { certName, domains, email, autoRenew, remark });
    taskManager.executeTask(taskId, async (id, progress, addLog) => {
      progress(5, '准备申请证书');
      addLog('开始执行证书申请');
      const result = await issueInitialCert({ certName, domains, email, autoRenew, remark });
      taskManager.updateTask(id, { result });
      progress(100, '证书申请完成');
      addLog('证书申请完成');
    });
    log.info('申请证书', JSON.stringify({ certName, domainsCount: domains.length, taskId })).catch(() => {});
    res.json({ success: true, message: '申请任务已创建', data: { taskId } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('申请证书', msg).catch(() => {});
    res.status(500).json({ success: false, message: '申请证书失败', error: msg });
  }
});

router.get('/ssl/certs', async (_req, res) => {
  try {
    const data = await getCertIndex();
    res.json({ success: true, data });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('证书列表', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取证书列表失败', error: msg });
  }
});

router.get('/ssl/certs/:name/meta', async (req, res) => {
  try {
    const name = req.params && req.params.name ? String(req.params.name).trim() : '';
    if (!name) {
      log.warning('证书详情', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const meta = await getCertMeta(name);
    res.json({ success: true, data: meta });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('证书详情', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取证书详情失败', error: msg });
  }
});

router.get('/ssl/certs/:name/public', async (req, res) => {
  try {
    const name = req.params && req.params.name ? String(req.params.name).trim() : '';
    if (!name) {
      log.warning('获取公钥', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const pem = await getCertPublicPem(name);
    res.json({ success: true, data: { pem } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取公钥', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取公钥证书失败', error: msg });
  }
});

router.get('/ssl/certs/:name/private', async (req, res) => {
  try {
    const name = req.params && req.params.name ? String(req.params.name).trim() : '';
    if (!name) {
      log.warning('获取私钥', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const pem = await getCertPrivatePem(name);
    res.json({ success: true, data: { pem } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取私钥', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取私钥失败', error: msg });
  }
});

router.post('/ssl/repair-index', async (_req, res) => {
  try {
    const result = await repairCertIndex();
    log.info('修复证书索引', JSON.stringify({ containerId: result && result.containerId })).catch(() => {});
    res.json({ success: true, message: '修复完成', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('修复证书索引', msg).catch(() => {});
    res.status(500).json({ success: false, message: '修复证书索引失败', error: msg });
  }
});

router.post('/ssl/certs/:name/meta', async (req, res) => {
  try {
    const name = req.params && req.params.name ? String(req.params.name).trim() : '';
    if (!name) {
      log.warning('更新证书', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const body = req.body || {};
    const changes = {};
    if (Object.prototype.hasOwnProperty.call(body, 'remark')) changes.remark = body.remark;
    if (Object.prototype.hasOwnProperty.call(body, 'email')) changes.email = body.email;
    if (Object.prototype.hasOwnProperty.call(body, 'autoRenew')) changes.autoRenew = body.autoRenew;
    const meta = await updateCertMeta(name, changes);
    log.info('更新证书', JSON.stringify({ name })).catch(() => {});
    res.json({ success: true, message: '更新成功', data: meta });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('更新证书', msg).catch(() => {});
    res.status(500).json({ success: false, message: '更新证书元数据失败', error: msg });
  }
});

router.post('/ssl/upload', async (req, res) => {
  try {
    const body = req.body || {};
    const publicPem = body.publicPem;
    const privatePem = body.privatePem;
    if (!publicPem || !privatePem) {
      log.warning('上传证书', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const result = await uploadCert({
      certName: body.certName,
      email: body.email,
      remark: body.remark,
      publicPem: body.publicPem,
      privatePem: body.privatePem
    });
    log.info('上传证书', JSON.stringify({ certName: result.certName, domainsCount: Array.isArray(result.domains) ? result.domains.length : 0 })).catch(() => {});
    res.json({ success: true, message: '上传成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('上传证书', msg).catch(() => {});
    res.status(500).json({ success: false, message: '上传证书失败', error: msg });
  }
});

router.delete('/ssl/certs/:name', async (req, res) => {
  try {
    const name = req.params && req.params.name ? String(req.params.name).trim() : '';
    if (!name) {
      log.warning('删除证书', '参数不完整').catch(() => {});
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const result = await deleteCert(name);
    log.info('删除证书', JSON.stringify({ certName: name, taskId: result.taskId })).catch(() => {});
    res.json({ success: true, message: '删除任务已创建', taskId: result.taskId });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('删除证书', msg).catch(() => {});
    res.status(500).json({ success: false, message: '删除证书失败', error: msg });
  }
});

module.exports = router;
