const Docker = require('dockerode');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { getPath } = require('../../config/paths');
const { taskManager } = require('../basic/task-manager');

const docker = new Docker();
const INTERNAL_PORT = 9000;
const NETWORK_NAME = 'xmp-network';

function validateContainerName(name) {
  const n = String(name || '').trim();
  if (!/^php\d{2}$/.test(n)) {
    throw new Error('容器名必须是php+2位数字');
  }
  return n;
}

function resolveHostPort(portInput) {
  const port = Number(portInput);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('无效的端口号');
  }
  return port;
}

async function ensureContainerNotExists(containerName) {
  const containers = await docker.listContainers({ all: true });
  const exists = containers.some(c => {
    const names = Array.isArray(c.Names) ? c.Names : [];
    return names.some(n => String(n || '').replace(/^\//, '') === containerName);
  });
  if (exists) {
    throw new Error('容器已存在: ' + containerName);
  }
}

async function ensurePortAvailable(port) {
  const ok = await new Promise(resolve => {
    const server = net.createServer();
    server.once('error', err => {
      if (err && err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
  if (!ok) {
    throw new Error('端口占用: ' + port);
  }
}

async function ensureNetworkExists(networkName) {
  const networks = await docker.listNetworks();
  const exists = networks.some(n => n && n.Name === networkName);
  if (!exists) {
    throw new Error('指定网络不存在: ' + networkName);
  }
}

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {}
}

function buildMounts(containerName) {
  const websiteHostPath = getPath('data', 'www', 'openresty', 'website');
  const phpRoot = getPath('data', 'www', 'php', containerName);
  const phpConfPhpD = path.join(phpRoot, 'conf', 'php.d');
  const phpConfFpmD = path.join(phpRoot, 'conf', 'fpm.d');
  const phpExt = path.join(phpRoot, 'ext');
  ensureDir(websiteHostPath);
  ensureDir(phpConfPhpD);
  ensureDir(phpConfFpmD);
  ensureDir(phpExt);
  return [
    websiteHostPath + ':/www/website',
    phpConfPhpD + ':/www/conf/php.d',
    phpConfFpmD + ':/www/conf/fpm.d',
    phpExt + ':/www/ext'
  ];
}

async function performInstall(imageInput, containerNameInput, portInput, updateProgress, addLog) {
  const progress = typeof updateProgress === 'function' ? updateProgress : () => {};
  const log = typeof addLog === 'function' ? addLog : () => {};
  const imageName = String(imageInput || '').trim();
  if (!imageName) {
    throw new Error('镜像名不能为空');
  }
  const containerName = validateContainerName(containerNameInput);
  const hostPort = resolveHostPort(portInput);
  progress(5, '准备安装PHP环境');
  log('开始安装PHP环境');
  log('目标容器: ' + containerName);
  await ensureContainerNotExists(containerName);
  log('监听端口: ' + hostPort);
  progress(15, '检查端口');
  await ensurePortAvailable(hostPort);
  progress(25, '检查网络');
  await ensureNetworkExists(NETWORK_NAME);
  progress(35, '准备挂载目录');
  const binds = buildMounts(containerName);
  progress(45, '检查镜像');
  let hasImage = false;
  try {
    const image = docker.getImage(imageName);
    await image.inspect();
    hasImage = true;
    log('镜像已存在: ' + imageName);
  } catch (err) {
    const code = err && err.statusCode ? Number(err.statusCode) : 0;
    if (code === 404) {
      log('镜像不存在，开始拉取: ' + imageName);
      const stream = await docker.pull(imageName);
      progress(50, '拉取镜像');
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          stream,
          (error) => {
            if (error) {
              log('拉取镜像失败: ' + String(error && error.message || 'error'));
              reject(error);
            } else {
              resolve();
            }
          },
          (event) => {
            if (event && event.status) {
              log(String(event.status));
            }
          }
        );
      });
      log('镜像拉取完成');
      hasImage = true;
    } else {
      throw new Error('检查镜像失败: ' + String(err && err.message || 'error'));
    }
  }
  if (!hasImage) {
    throw new Error('镜像不可用: ' + imageName);
  }
  const portKey = INTERNAL_PORT + '/tcp';
  progress(70, '创建容器');
  const containerConfig = {
    Image: imageName,
    name: containerName,
    User: '0:0',
    HostConfig: {
      PortBindings: {
        [portKey]: [
          {
            HostIp: '127.0.0.1',
            HostPort: String(hostPort)
          }
        ]
      },
      Binds: binds
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [NETWORK_NAME]: {}
      }
    }
  };
  let container = null;
  try {
    log('创建容器配置完成，开始创建容器');
    container = await docker.createContainer(containerConfig);
    log('容器已创建: ' + String(container && container.id || ''));
    progress(85, '启动容器');
    await container.start();
    log('PHP容器启动成功');
  } catch (error) {
    if (container && container.id) {
      try {
        await docker.getContainer(container.id).remove({ force: true });
      } catch {}
    }
    throw new Error('PHP容器创建失败: ' + error.message);
  }
  progress(100, 'PHP环境安装完成');
  return {
    success: true,
    containerName,
    image: imageName,
    hostPort
  };
}

function installPhpAsync(image, containerName, portInput) {
  const taskId = taskManager.createTask('php.install', { image, containerName, port: portInput });
  taskManager.executeTask(taskId, async (id, updateProgress, addLog) => {
    const result = await performInstall(image, containerName, portInput, updateProgress, addLog);
    taskManager.updateTask(id, { result });
  });
  return taskId;
}

module.exports = {
  installPhpAsync
};
