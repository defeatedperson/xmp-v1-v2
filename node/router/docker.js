const express = require('express');
const router = express.Router();
const { dockerManager, dockerAdvancedManager, dockerEngineManager } = require('../function/docker');
const log = require('../function/basic/log');
const { isValidDockerIdentifier } = require('../function/basic/docker-identifier');
const { parseIntInRange, parseBooleanLike } = require('../function/basic/number-boolean');

// 测试Docker连接
router.get('/test-connection', async (req, res) => {
  try {
    const result = await dockerManager.testConnection();
    res.json({
      success: true,
      message: 'Docker连接测试成功',
      data: result
    });
  } catch (error) {
    log.error('Docker连接测试', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: 'Docker连接测试失败',
      error: error.message
    });
  }
});

// ===== 容器管理 =====

// 获取容器列表
router.get('/containers', async (req, res) => {
  try {
    const all = parseBooleanLike(req.query && req.query.all, true);
    const containers = await dockerManager.listContainers(all);
    res.json({
      success: true,
      data: containers
    });
  } catch (error) {
    log.error('获取容器列表', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取容器列表失败',
      error: error.message
    });
  }
});

// 获取容器详细信息
router.get('/containers/:id', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim();
    if (!isValidDockerIdentifier(id)) {
      log.warning('获取容器详情', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const containerInfo = await dockerManager.getContainerInfo(id);
    res.json({
      success: true,
      data: containerInfo
    });
  } catch (error) {
    log.error('获取容器详情', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取容器信息失败',
      error: error.message
    });
  }
});

// 获取容器网络信息（IP等）
router.get('/containers/:id/networks', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim();
    if (!isValidDockerIdentifier(id)) {
      log.warning('获取容器网络', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const data = await dockerManager.getContainerNetworks(id);
    res.json({ success: true, data });
  } catch (error) {
    log.error('获取容器网络', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '获取容器网络信息失败', error: error.message });
  }
});

// 获取容器性能限制信息（预设方案）
router.get('/containers/:id/performance', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim();
    if (!isValidDockerIdentifier(id)) {
      log.warning('获取容器性能', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const info = await dockerManager.getContainerInfo(id);
    const perf = info && info.performance ? info.performance : { plan: 0, nanoCpus: 0, memoryBytes: 0 };
    res.json({
      success: true,
      data: perf
    });
  } catch (error) {
    log.error('获取容器性能', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取容器性能限制信息失败',
      error: error.message
    });
  }
});

router.get('/containers/:id/logs', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim();
    if (!isValidDockerIdentifier(id)) {
      log.warning('获取容器日志', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const { stdout, stderr, tail, since, timestamps } = req.query;
    const validatedTail = parseIntInRange(tail, { min: 0, max: 10000, defaultValue: 500 });
    const validatedSince = since !== undefined ? parseIntInRange(since, { min: 0, max: Number.MAX_SAFE_INTEGER, defaultValue: undefined }) : undefined;
    const result = await dockerAdvancedManager.getContainerLogs(id, {
      stdout: parseBooleanLike(stdout, true),
      stderr: parseBooleanLike(stderr, false),
      tail: validatedTail,
      since: validatedSince,
      timestamps: parseBooleanLike(timestamps, true)
    });
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    log.error('获取容器日志', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取容器日志失败',
      error: error.message
    });
  }
});

// 创建容器（异步）：返回 taskId，用于跟踪拉镜像/创建/启动全过程

router.post('/containers/async', async (req, res) => {
  try {
    const config = req.body;
    const taskId = await dockerManager.createContainerAsync(config);
    log.info('创建容器', JSON.stringify({ config: Object.keys(config), taskId })).catch(() => {});
    res.json({ success: true, message: '容器创建任务已创建', data: { taskId } });
  } catch (error) {
    log.error('创建容器', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '创建容器任务失败', error: error.message });
  }
});

// 启动容器
router.post('/containers/:id/start', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim();
    if (!isValidDockerIdentifier(id)) {
      log.warning('启动容器', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const result = await dockerManager.startContainer(id);
    log.info('启动容器', JSON.stringify({ id })).catch(() => {});
    res.json({
      success: true,
      message: '容器启动成功',
      data: result
    });
  } catch (error) {
    log.error('启动容器', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '启动容器失败',
      error: error.message
    });
  }
});

// 停止容器
router.post('/containers/:id/stop', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim();
    if (!isValidDockerIdentifier(id)) {
      log.warning('停止容器', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const { timeout = 10 } = req.body;
    const result = await dockerManager.stopContainer(id, timeout);
    log.info('停止容器', JSON.stringify({ id, timeout })).catch(() => {});
    res.json({
      success: true,
      message: '容器停止成功',
      data: result
    });
  } catch (error) {
    log.error('停止容器', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '停止容器失败',
      error: error.message
    });
  }
});

// 删除容器
router.delete('/containers/:id', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim();
    if (!isValidDockerIdentifier(id)) {
      log.warning('删除容器', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const { force = 'false', removeVolumes = 'false', cleanBinds = 'false' } = req.query;
    const options = {
      force: force === 'true',
      removeVolumes: removeVolumes === 'true',
      cleanBinds: cleanBinds === 'true'
    };
    const result = await dockerManager.removeContainer(id, options);
    log.info('删除容器', JSON.stringify({ id, force: options.force, removeVolumes: options.removeVolumes, cleanBinds: options.cleanBinds })).catch(() => {});
    res.json({
      success: true,
      message: '容器删除成功',
      data: result
    });
  } catch (error) {
    log.error('删除容器', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '删除容器失败',
      error: error.message
    });
  }
});

// 升级容器
router.put('/containers/:id/upgrade', async (req, res) => {
  try {
    const id = String(req.params && req.params.id || '').trim();
    if (!isValidDockerIdentifier(id)) {
      log.warning('升级容器', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const newConfig = req.body;
    const taskId = await dockerManager.upgradeContainerAsync(id, newConfig);
    log.info('升级容器', JSON.stringify({ id, configKeys: Object.keys(newConfig), taskId })).catch(() => {});
    res.json({ success: true, message: '容器升级任务已创建', data: { taskId } });
  } catch (error) {
    log.error('升级容器', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '升级容器失败',
      error: error.message
    });
  }
});

 

// ===== 镜像管理 =====

// 获取镜像列表
router.get('/images', async (req, res) => {
  try {
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
    const images = await dockerAdvancedManager.listImages(filters);
    res.json({
      success: true,
      data: images
    });
  } catch (error) {
    log.error('获取镜像列表', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取镜像列表失败',
      error: error.message
    });
  }
});

router.get('/networks', async (req, res) => {
  try {
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
    const networks = await dockerAdvancedManager.listNetworks(filters);
    res.json({
      success: true,
      data: networks
    });
  } catch (error) {
    log.error('获取网络列表', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取网络列表失败',
      error: error.message
    });
  }
});

router.get('/networks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const info = await dockerAdvancedManager.getNetworkInfo(id);
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    log.error('获取网络详情', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取网络信息失败',
      error: error.message
    });
  }
});

router.post('/networks', async (req, res) => {
  try {
    const config = req.body || {};
    const result = await dockerAdvancedManager.createNetwork(config);
    log.info('创建网络', JSON.stringify({ name: config.name, driver: config.driver || 'bridge' })).catch(() => {});
    res.json({
      success: true,
      message: '网络创建成功',
      data: result
    });
  } catch (error) {
    log.error('创建网络', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '创建网络失败',
      error: error.message
    });
  }
});

router.post('/networks/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    const { containerId, endpointConfig = {} } = req.body || {};
    const containerIdValue = String(containerId || '').trim();
    if (!isValidDockerIdentifier(containerIdValue)) {
      log.warning('连接网络', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const result = await dockerAdvancedManager.connectContainerToNetwork(id, { containerId: containerIdValue, endpointConfig });
    log.info('连接网络', JSON.stringify({ id, containerId })).catch(() => {});
    res.json({
      success: true,
      message: '容器连接网络成功',
      data: result
    });
  } catch (error) {
    log.error('连接网络', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '容器连接网络失败',
      error: error.message
    });
  }
});

router.post('/networks/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;
    const { containerId, force = false } = req.body || {};
    const containerIdValue = String(containerId || '').trim();
    if (!isValidDockerIdentifier(containerIdValue)) {
      log.warning('断开网络', '容器标识不合法').catch(() => {});
      return res.status(400).json({ success: false, message: '容器标识不合法' });
    }
    const result = await dockerAdvancedManager.disconnectContainerFromNetwork(id, { containerId: containerIdValue, force });
    log.info('断开网络', JSON.stringify({ id, containerId, force })).catch(() => {});
    res.json({
      success: true,
      message: '容器断开网络成功',
      data: result
    });
  } catch (error) {
    log.error('断开网络', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '容器断开网络失败',
      error: error.message
    });
  }
});

router.delete('/networks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dockerAdvancedManager.removeNetwork(id);
    log.info('删除网络', JSON.stringify({ id })).catch(() => {});
    res.json({
      success: true,
      message: '网络删除成功',
      data: result
    });
  } catch (error) {
    log.error('删除网络', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '删除网络失败',
      error: error.message
    });
  }
});

router.post('/engine/restart', async (_req, res) => {
  try {
    const taskId = await dockerEngineManager.restartDockerAsync();
    log.info('重启Docker引擎', JSON.stringify({ taskId })).catch(() => {});
    res.json({ success: true, message: '引擎重启请求已提交', data: { taskId } });
  } catch (error) {
    log.error('重启Docker引擎', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({ success: false, message: '引擎重启失败', error: error.message });
  }
});

 
 
// 获取镜像详细信息
router.get('/images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const imageInfo = await dockerAdvancedManager.getImageInfo(id);
    res.json({
      success: true,
      data: imageInfo
    });
  } catch (error) {
    log.error('获取镜像详情', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取镜像信息失败',
      error: error.message
    });
  }
});

// 删除镜像
router.delete('/images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { force = false, noprune = false } = req.query;
    const result = await dockerAdvancedManager.removeImage(id, {
      force: force === 'true',
      noprune: noprune === 'true'
    });
    log.info('删除镜像', JSON.stringify({ id, force: force === 'true', noprune: noprune === 'true' })).catch(() => {});
    res.json({
      success: true,
      message: '镜像删除成功',
      data: result
    });
  } catch (error) {
    const rawMsg = String(error && error.message || 'error');
    const status = (error && error.statusCode) ? Number(error.statusCode) : 500;
    let msg = '删除镜像失败';
    if (status === 409) {
      const conflictText = String(error && error.json && error.json.message || rawMsg);
      if (/must be forced|referenced in multiple repositories/i.test(conflictText)) {
        msg = '删除镜像失败，镜像被多个仓库引用。可尝试使用强制删除参数 force=true';
      } else {
        msg = '删除镜像失败，发生资源冲突';
      }
    }
    log.error('删除镜像', rawMsg).catch(() => {});
    res.status(status).json({
      success: false,
      message: msg,
      error: rawMsg
    });
  }
});

// 拉取镜像
router.post('/images/pull', async (req, res) => {
  try {
    const { imageName } = req.body;
    
    if (!imageName) {
      log.warning('拉取镜像', '镜像名称不能为空').catch(() => {});
      return res.status(400).json({
        success: false,
        message: '镜像名称不能为空'
      });
    }
    
    // 使用异步拉取镜像
    const taskId = await dockerManager.pullImage(imageName);
    log.info('拉取镜像', JSON.stringify({ imageName, taskId })).catch(() => {});
    
    res.json({
      success: true,
      message: '镜像拉取任务已创建',
      data: {
        taskId,
        imageName
      }
    });
  } catch (error) {
    log.error('拉取镜像', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '创建拉取镜像任务失败',
      error: error.message
    });
  }
});

 

// ===== 存储卷管理 =====

// 获取存储卷列表
router.get('/volumes', async (req, res) => {
  try {
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
    const volumes = await dockerAdvancedManager.listVolumes(filters);
    res.json({
      success: true,
      data: volumes
    });
  } catch (error) {
    log.error('获取存储卷列表', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取存储卷列表失败',
      error: error.message
    });
  }
});

// 获取存储卷详细信息
router.get('/volumes/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const volumeInfo = await dockerAdvancedManager.getVolumeInfo(name);
    res.json({
      success: true,
      data: volumeInfo
    });
  } catch (error) {
    log.error('获取存储卷详情', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '获取存储卷信息失败',
      error: error.message
    });
  }
});

// 创建存储卷
router.post('/volumes', async (req, res) => {
  try {
    const config = req.body;
    const result = await dockerAdvancedManager.createVolume(config);
    log.info('创建存储卷', JSON.stringify({ config: Object.keys(config) })).catch(() => {});
    res.json({
      success: true,
      message: '存储卷创建成功',
      data: result
    });
  } catch (error) {
    log.error('创建存储卷', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '创建存储卷失败',
      error: error.message
    });
  }
});

// 删除存储卷
router.delete('/volumes/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { force = false } = req.query;
    const result = await dockerAdvancedManager.removeVolume(name, force === 'true');
    log.info('删除存储卷', JSON.stringify({ name, force: force === 'true' })).catch(() => {});
    res.json({
      success: true,
      message: '存储卷删除成功',
      data: result
    });
  } catch (error) {
    log.error('删除存储卷', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '删除存储卷失败',
      error: error.message
    });
  }
});

// ===== 资源清理 =====

// 清理Docker构建缓存
router.post('/prune', async (_req, res) => {
  try {
    const taskId = await dockerAdvancedManager.pruneResourcesAsync();
    log.info('清理构建缓存', JSON.stringify({ taskId })).catch(() => {});
    res.json({ success: true, message: '构建缓存清理任务已创建', data: { taskId } });
  } catch (error) {
    log.error('清理构建缓存', String(error && error.message || 'error')).catch(() => {});
    res.status(500).json({
      success: false,
      message: '构建缓存清理失败',
      error: error.message
    });
  }
});

module.exports = router;
