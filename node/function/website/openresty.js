const { dockerManager, dockerAdvancedManager } = require('../docker');

const DEFAULT_NAME = 'openresty';

async function getOpenrestyContainer() {
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === DEFAULT_NAME);
  if (!target) throw new Error('openresty容器不存在');
  return target;
}

async function truncateErrorLogByDomain(primaryDomain) {
  const value = String(primaryDomain || '').trim();
  if (!value) throw new Error('primaryDomain不能为空');
  const target = await getOpenrestyContainer();
  const filePath = `/www/web_log/${value}.error.log`;
  const cmd = ['sh', '-lc', `: > ${filePath}`];
  const res = await dockerAdvancedManager.executeCommand(target.containerId, cmd, { tty: false, quiet: true });
  if (!res || res.exitCode !== 0) {
    const msg = (res && (res.errorOutput || res.output)) || '';
    throw new Error('清理错误日志失败' + (msg ? ': ' + String(msg).trim() : ''));
  }
  return { success: true, containerId: target.containerId, filePath, primaryDomain: value };
}

async function reloadOpenresty(options = {}) {
  const target = await getOpenrestyContainer();
  const cmd = options.cmd && Array.isArray(options.cmd) ? options.cmd : ['openresty', '-s', 'reload'];
  const res = await dockerAdvancedManager.executeCommand(target.containerId, cmd, { tty: false, quiet: true });
  if (!res || res.exitCode !== 0) {
    const msg = (res && (res.errorOutput || res.output)) || '';
    throw new Error('重载openresty失败' + (msg ? ': ' + String(msg).trim() : ''));
  }
  return { success: true, containerId: target.containerId };
}

async function startOpenresty() {
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === DEFAULT_NAME);
  if (!target) throw new Error('openresty容器不存在');
  const info = await dockerManager.getContainerInfo(target.containerId);
  if (info && info.running) {
    return { success: true, message: '容器已经在运行', containerId: target.containerId };
  }
  const result = await dockerManager.startContainer(target.containerId);
  return result;
}

async function stopOpenresty() {
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === DEFAULT_NAME);
  if (!target) throw new Error('openresty容器不存在');
  const info = await dockerManager.getContainerInfo(target.containerId);
  if (!info || !info.running) {
    return { success: true, message: '容器已经停止', containerId: target.containerId };
  }
  const result = await dockerManager.stopContainer(target.containerId, 10);
  return result;
}

async function getOpenrestyStatus() {
  try {
    const list = await dockerManager.listContainers(true);
    const target = list.find(c => c && c.name === DEFAULT_NAME);
    if (!target) {
      return { exists: false, running: false, status: '不存在' };
    }
    const info = await dockerManager.getContainerInfo(target.containerId);
    if (!info || !info.running) {
      return { exists: true, running: false, status: '未启动', containerId: target.containerId };
    }
    return { exists: true, running: true, status: '正常', containerId: target.containerId };
  } catch {
    return { exists: false, running: false, status: '未知' };
  }
}

module.exports = {
  getOpenrestyContainer,
  reloadOpenresty,
  startOpenresty,
  stopOpenresty,
  getOpenrestyStatus,
  truncateErrorLogByDomain
};
