const express = require('express');
const router = express.Router();
const log = require('../function/basic/log');
const { validateDomainName } = require('../function/router/validator');
const { reloadOpenresty, truncateErrorLogByDomain } = require('../function/website/openresty');
const { listSites, refreshFromConfigs, createSite, deleteSite, updateSite } = require('../function/website/manager');
const { listDomainLogs, analyzeDomainLog } = require('../function/website/log-reader');
const { readWebRuleConfig, updateWebRuleConfig, CONFIG_TYPES } = require('../function/website/web-rule-config');

router.get('/', async (_req, res) => {
  try {
    const sites = listSites();
    res.json({ success: true, data: sites });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取站点列表', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取站点列表失败', error: msg });
  }
});

router.post('/refresh', async (_req, res) => {
  try {
    const result = refreshFromConfigs();
    res.json({ success: true, message: '刷新完成', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('刷新站点配置', msg).catch(() => {});
    res.status(500).json({ success: false, message: '刷新站点失败', error: msg });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const primaryDomain = String(body.primaryDomain || '').trim();
    if (!primaryDomain) {
      log.warning('创建站点', 'primaryDomain 不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 不能为空' });
    }
    const domainValidation = validateDomainName(primaryDomain);
    if (!domainValidation.valid) {
      log.warning('创建站点', 'primaryDomain 格式无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 格式无效' });
    }
    const type = String(body.type || 'static').trim() || 'static';
    if (!['static', 'php', 'proxy'].includes(type)) {
      log.warning('创建站点', 'type 无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'type 无效' });
    }
    if (type === 'php') {
      const phpPort = Number(body.phpFastcgiPort);
      if (!Number.isInteger(phpPort) || phpPort <= 0 || phpPort > 65535) {
        log.warning('创建站点', 'phpFastcgiPort 不能为空或无效').catch(() => {});
        return res.status(400).json({ success: false, message: 'phpFastcgiPort 不能为空或无效' });
      }
    }
    if (type === 'proxy') {
      const target = String(body.proxyTarget || '').trim();
      if (!target) {
        log.warning('创建站点', 'proxyTarget 不能为空或无效').catch(() => {});
        return res.status(400).json({ success: false, message: 'proxyTarget 不能为空或无效' });
      }
      if (/[\r\n;]/.test(target)) {
        log.warning('创建站点', 'proxyTarget 不能为空或无效').catch(() => {});
        return res.status(400).json({ success: false, message: 'proxyTarget 不能为空或无效' });
      }
    }
    const result = await createSite(body);
    let reload = { success: false, message: '重载未执行' };
    try {
      reload = await reloadOpenresty();
    } catch (e) {
      const msg = String(e && e.message || 'error');
      log.error('创建站点-重载', msg).catch(() => {});
      reload = { success: false, message: msg };
    }
    log.info('创建站点', JSON.stringify({ primaryDomain: result.site && result.site.primaryDomain })).catch(() => {});
    res.json({ success: true, message: '创建成功', data: { ...result, reload } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('创建站点', msg).catch(() => {});
    res.status(500).json({ success: false, message: '创建站点失败', error: msg });
  }
});

router.patch('/:primaryDomain', async (req, res) => {
  try {
    const primaryDomain = req.params && req.params.primaryDomain ? String(req.params.primaryDomain).trim() : '';
    if (!primaryDomain) {
      log.warning('更新站点', 'primaryDomain 不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 不能为空' });
    }
    const domainValidation = validateDomainName(primaryDomain);
    if (!domainValidation.valid) {
      log.warning('更新站点', 'primaryDomain 格式无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 格式无效' });
    }
    const body = req.body || {};
    const requestedType = Object.prototype.hasOwnProperty.call(body, 'type')
      ? String(body.type || '').trim()
      : '';
    if (requestedType && !['static', 'php', 'proxy'].includes(requestedType)) {
      log.warning('更新站点', 'type 无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'type 无效' });
    }
    if (requestedType === 'php') {
      const phpPort = Number(body.phpFastcgiPort);
      if (!Number.isInteger(phpPort) || phpPort <= 0 || phpPort > 65535) {
        log.warning('更新站点', 'phpFastcgiPort 不能为空或无效').catch(() => {});
        return res.status(400).json({ success: false, message: 'phpFastcgiPort 不能为空或无效' });
      }
    }
    if (requestedType === 'proxy') {
      const target = String(body.proxyTarget || '').trim();
      if (!target) {
        log.warning('更新站点', 'proxyTarget 不能为空或无效').catch(() => {});
        return res.status(400).json({ success: false, message: 'proxyTarget 不能为空或无效' });
      }
      if (/[\r\n;]/.test(target)) {
        log.warning('更新站点', 'proxyTarget 不能为空或无效').catch(() => {});
        return res.status(400).json({ success: false, message: 'proxyTarget 不能为空或无效' });
      }
    }
    const changes = { ...body, primaryDomain };
    const result = await updateSite(changes);
    let reload = { success: false, message: '重载未执行' };
    try {
      reload = await reloadOpenresty();
    } catch (e) {
      const msg = String(e && e.message || 'error');
      log.error('更新站点-重载', msg).catch(() => {});
      reload = { success: false, message: msg };
    }
    log.info('更新站点', JSON.stringify({ primaryDomain })).catch(() => {});
    res.json({ success: true, message: '更新成功', data: { ...result, reload } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('更新站点', msg).catch(() => {});
    res.status(500).json({ success: false, message: '更新站点失败', error: msg });
  }
});

router.delete('/:primaryDomain', async (req, res) => {
  try {
    const primaryDomain = req.params && req.params.primaryDomain ? String(req.params.primaryDomain).trim() : '';
    if (!primaryDomain) {
      log.warning('删除站点', 'primaryDomain 不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 不能为空' });
    }
    const domainValidation = validateDomainName(primaryDomain);
    if (!domainValidation.valid) {
      log.warning('删除站点', 'primaryDomain 格式无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 格式无效' });
    }
    const result = await deleteSite(primaryDomain);
    if (!result.success) {
      log.warning('删除站点', '记录不存在').catch(() => {});
      return res.status(404).json({ success: false, message: '记录不存在', data: result });
    }
    let reload = null;
    try {
      reload = await reloadOpenresty();
    } catch (e) {
      const msg = String(e && e.message || 'error');
      log.error('删除站点-重载', msg).catch(() => {});
    }
    log.info('删除站点', JSON.stringify({ primaryDomain })).catch(() => {});
    res.json({ success: true, message: '删除成功', data: { ...result, reload } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('删除站点', msg).catch(() => {});
    res.status(500).json({ success: false, message: '删除站点失败', error: msg });
  }
});

router.get('/:primaryDomain/logs', async (req, res) => {
  try {
    const primaryDomain = req.params && req.params.primaryDomain ? String(req.params.primaryDomain).trim() : '';
    if (!primaryDomain) {
      log.warning('获取站点日志', 'primaryDomain 不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 不能为空' });
    }
    const domainValidation = validateDomainName(primaryDomain);
    if (!domainValidation.valid) {
      log.warning('获取站点日志', 'primaryDomain 格式无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 格式无效' });
    }
    
    const result = await listDomainLogs(primaryDomain);
    
    if (!result.ok) {
      const statusCode = result.code === 404 ? 404 : (result.code === 400 ? 400 : 500);
      log.warning('获取站点日志', `获取日志文件失败: ${result.error}`).catch(() => {});
      return res.status(statusCode).json({ success: false, message: result.error });
    }
    
    res.json({ success: true, message: '获取日志文件成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('获取站点日志', msg).catch(() => {});
    res.status(500).json({ success: false, message: '获取日志文件失败', error: msg });
  }
});

router.get('/:primaryDomain/logs/analyze', async (req, res) => {
  try {
    const primaryDomain = req.params && req.params.primaryDomain ? String(req.params.primaryDomain).trim() : '';
    if (!primaryDomain) {
      log.warning('分析站点日志', 'primaryDomain 不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 不能为空' });
    }
    const domainValidation = validateDomainName(primaryDomain);
    if (!domainValidation.valid) {
      log.warning('分析站点日志', 'primaryDomain 格式无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 格式无效' });
    }

    const queryType = req.query && req.query.type ? String(req.query.type).trim() : 'today-access';

    const result = await analyzeDomainLog(primaryDomain, queryType);

    if (!result.ok) {
      const code = result.code || 500;
      const statusCode = code === 404 || code === 413 || code === 408 ? code : 500;
      const message = result.error || '日志分析失败';
      log.warning('分析站点日志', `分析日志失败: ${message}`).catch(() => {});
      return res.status(statusCode).json({ success: false, message });
    }

    res.json({ success: true, message: '分析日志成功', data: result });
  } catch (error) {
    const msg = String((error && error.message) || 'error');
    log.error('分析站点日志', msg).catch(() => {});
    res.status(500).json({ success: false, message: '分析日志失败', error: msg });
  }
});

router.post('/:primaryDomain/logs/error/clear', async (req, res) => {
  try {
    const primaryDomain = req.params && req.params.primaryDomain ? String(req.params.primaryDomain).trim() : '';
    if (!primaryDomain) {
      log.warning('清理错误日志', 'primaryDomain 不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 不能为空' });
    }
    const domainValidation = validateDomainName(primaryDomain);
    if (!domainValidation.valid) {
      log.warning('清理错误日志', 'primaryDomain 格式无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 格式无效' });
    }

    const result = await truncateErrorLogByDomain(primaryDomain);

    log.info('清理错误日志', JSON.stringify({ primaryDomain, filePath: result.filePath })).catch(() => {});
    res.json({ success: true, message: '清理错误日志成功', data: result });
  } catch (error) {
    const msg = String((error && error.message) || 'error');
    log.error('清理错误日志', msg).catch(() => {});
    res.status(500).json({ success: false, message: '清理错误日志失败', error: msg });
  }
});

router.get('/:primaryDomain/config/:type', async (req, res) => {
  try {
    const primaryDomain = req.params && req.params.primaryDomain ? String(req.params.primaryDomain).trim() : '';
    const type = req.params && req.params.type ? String(req.params.type).trim() : '';
    
    if (!primaryDomain) {
      log.warning('读取站点配置', 'primaryDomain 不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 不能为空' });
    }
    const domainValidation = validateDomainName(primaryDomain);
    if (!domainValidation.valid) {
      log.warning('读取站点配置', 'primaryDomain 格式无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 格式无效' });
    }
    if (!type || !Object.values(CONFIG_TYPES).includes(type)) {
      log.warning('读取站点配置', `配置类型无效: ${type}`).catch(() => {});
      return res.status(400).json({ success: false, message: `配置类型无效，支持: ${Object.values(CONFIG_TYPES).join(', ')}` });
    }
    
    const result = await readWebRuleConfig(primaryDomain, type);
    
    if (!result.success) {
      log.warning('读取站点配置', `读取配置失败: ${result.error}`).catch(() => {});
      return res.status(500).json({ success: false, message: result.error });
    }
    
    log.info('读取站点配置', JSON.stringify({ primaryDomain, type, filePath: result.filePath, created: result.created })).catch(() => {});
    res.json({ success: true, message: '读取配置成功', data: result });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('读取站点配置', msg).catch(() => {});
    res.status(500).json({ success: false, message: '读取配置失败', error: msg });
  }
});

router.put('/:primaryDomain/config/:type', async (req, res) => {
  try {
    const primaryDomain = req.params && req.params.primaryDomain ? String(req.params.primaryDomain).trim() : '';
    const type = req.params && req.params.type ? String(req.params.type).trim() : '';
    const body = req.body || {};
    const content = body.content;
    
    if (!primaryDomain) {
      log.warning('更新站点配置', 'primaryDomain 不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 不能为空' });
    }
    const domainValidation = validateDomainName(primaryDomain);
    if (!domainValidation.valid) {
      log.warning('更新站点配置', 'primaryDomain 格式无效').catch(() => {});
      return res.status(400).json({ success: false, message: 'primaryDomain 格式无效' });
    }
    if (!type || !Object.values(CONFIG_TYPES).includes(type)) {
      log.warning('更新站点配置', `配置类型无效: ${type}`).catch(() => {});
      return res.status(400).json({ success: false, message: `配置类型无效，支持: ${Object.values(CONFIG_TYPES).join(', ')}` });
    }
    if (content === undefined || content === null) {
      log.warning('更新站点配置', '配置内容不能为空').catch(() => {});
      return res.status(400).json({ success: false, message: '配置内容不能为空' });
    }
    
    const result = await updateWebRuleConfig(primaryDomain, type, content);
    
    if (!result.success) {
      log.warning('更新站点配置', `更新配置失败: ${result.error}`).catch(() => {});
      return res.status(500).json({ success: false, message: result.error });
    }
    
    let reload = null;
    try {
      reload = await reloadOpenresty();
    } catch (e) {
      const msg = String(e && e.message || 'error');
      log.error('更新站点配置-重载', msg).catch(() => {});
    }
    
    log.info('更新站点配置', JSON.stringify({ primaryDomain, type, filePath: result.filePath, bytesWritten: result.bytesWritten })).catch(() => {});
    res.json({ success: true, message: '更新配置成功', data: { ...result, reload } });
  } catch (error) {
    const msg = String(error && error.message || 'error');
    log.error('更新站点配置', msg).catch(() => {});
    res.status(500).json({ success: false, message: '更新配置失败', error: msg });
  }
});

module.exports = router;

