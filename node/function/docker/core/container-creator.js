const { taskManager } = require('../../basic/task-manager');
const { applyPerformancePreset } = require('./performance-presets');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { getPath } = require('../../../config/paths');

async function ensureImageExists(docker, image, updateProgress, addLog) {
  try {
    await docker.getImage(image).inspect();
    addLog(`镜像已存在: ${image}`);
    updateProgress(10, '检查镜像完成');
  } catch {
    updateProgress(10, '准备拉取镜像');
    addLog(`开始拉取镜像: ${image}`);
    try {
      const stream = await docker.pull(image);
      updateProgress(20, '正在拉取镜像');
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          stream,
          (err, res) => {
            if (err) {
              addLog(`镜像拉取失败: ${err.message}`);
              reject(err);
            } else {
              addLog('镜像拉取完成');
              updateProgress(60, '镜像拉取完成');
              resolve(res);
            }
          },
          event => {
            if (event && event.status && event.status !== 'Pull complete') {
              addLog(event.status);
              if (event.status.includes('Pulling fs layer')) {
                updateProgress(30, '下载镜像层');
              } else if (event.status.includes('Waiting')) {
                updateProgress(40, '等待下载');
              } else if (event.status.includes('Downloading')) {
                const progress = event.progressDetail || {};
                if (progress.current && progress.total) {
                  const percent = Math.min(
                    60,
                    Math.floor((progress.current / progress.total) * 30) + 40
                  );
                  updateProgress(percent, `下载中: ${event.status}`);
                }
              } else if (event.status.includes('Extracting')) {
                const progress = event.progressDetail || {};
                if (progress.current && progress.total) {
                  const percent = Math.min(
                    60,
                    Math.floor((progress.current / progress.total) * 20) + 40
                  );
                  updateProgress(percent, `解压中: ${event.status}`);
                }
              }
            }
          }
        );
      });
    } catch (error) {
      addLog(`拉取镜像异常: ${error.message}`);
      throw error;
    }
  }
}

/**
 * 检查端口是否被占用
 * @param {Object} ports - 端口配置对象
 * @param {string} ipBindCreate - IP绑定地址
 * @returns {Promise<Array>} 被占用的端口列表
 */
async function checkBusyPorts(ports, ipBindCreate) {
  const busyPorts = [];
  for (const containerPort of Object.keys(ports)) {
    const hostPort = Number(ports[containerPort]);
    if (!Number.isNaN(hostPort)) {
      const s = new net.Server();
      await new Promise(r => {
        s.once('error', err => { 
          if (err && err.code === 'EADDRINUSE') busyPorts.push(hostPort); 
          r(); 
        });
        s.listen(hostPort, ipBindCreate, () => { s.close(() => r()); });
      });
    }
  }
  return busyPorts;
}

/**
 * 处理卷挂载配置
 * @param {Object} volumes - 卷配置
 * @param {Object} volumePathTypes - 卷路径类型
 * @param {string} name - 容器名称
 * @returns {Array} 绑定配置数组
 */
function processVolumeBindings(volumes, volumePathTypes, name) {
  const binds = [];
  const namePrefix = (name || '').trim();
  
  Object.keys(volumes).forEach(hostPath => {
    const containerPath = volumes[hostPath];
    const type = volumePathTypes && volumePathTypes[containerPath] === 'file' ? 'file' : 'dir';
    let finalHostPath = hostPath;
    let containerMountPath = containerPath;
    let placeholderFileName = null;
    
    if (type === 'file') {
      const parts = String(containerPath || '').split('/').filter(Boolean);
      if (parts.length > 1) {
        placeholderFileName = parts[parts.length - 1];
        containerMountPath = '/' + parts.slice(0, -1).join('/');
      } else if (parts.length === 1) {
        placeholderFileName = parts[0];
        containerMountPath = '/';
      }
    }
    
    if (hostPath.startsWith('/')) {
      const baseContainerPath = type === 'file' ? containerMountPath : containerPath;
      const segs = baseContainerPath.replace(/^\/+/, '').split('/').filter(Boolean);
      finalHostPath = getPath('data', 'www', namePrefix, ...segs);
    } else {
      const raw = hostPath.replace(/^\/+/, '');
      const relSegs = raw.split(/[\\/]+/).filter(Boolean);
      const baseSegs = type === 'file' && relSegs.length > 1 ? relSegs.slice(0, -1) : relSegs;
      finalHostPath = getPath('data', 'www', namePrefix, ...baseSegs);
    }
    
    try {
      fs.mkdirSync(finalHostPath, { recursive: true });
      try {
        fs.chmodSync(finalHostPath, 0o777);
      } catch {}
    } catch {}
    
    if (type === 'file' && placeholderFileName) {
      const placeholderPath = path.join(finalHostPath, placeholderFileName);
      try {
        if (!fs.existsSync(placeholderPath)) {
          fs.writeFileSync(placeholderPath, '');
        }
      } catch {}
    }
    
    binds.push(`${finalHostPath}:${containerMountPath}`);
  });
  
  return binds;
}

/**
 * 处理网络配置
 * @param {Object} docker - Docker 实例
 * @param {Object} config - 配置对象
 * @param {Function} addLog - 日志添加函数
 * @returns {Promise<Object>} 网络配置
 */
async function processNetworkConfig(docker, config, addLog) {
  const { networkMode, network, networks } = config;
  
  // 启动命令
  const containerConfig = {};
  
  // 网络配置（host 或 指定已有网络）
  if (networkMode === 'host' || network === 'host') {
    containerConfig.HostConfig = { NetworkMode: 'host' };
  } else {
    const names = [];
    if (typeof network === 'string' && network) names.push(network);
    if (Array.isArray(networks)) names.push(...networks.filter(Boolean));
    
    if (names.length) {
      const list = await docker.listNetworks();
      const available = new Set((list || []).map(n => n.Name));
      const missing = names.filter(n => !available.has(n));
      if (missing.length) {
        addLog(`网络不存在: ${missing.join(',')}`);
        throw new Error(`指定网络不存在: ${missing.join(',')}`);
      }
      containerConfig.NetworkingConfig = { EndpointsConfig: {} };
      names.forEach(n => { containerConfig.NetworkingConfig.EndpointsConfig[n] = {}; });
    }
  }
  
  return containerConfig;
}

/**
 * 异步创建容器
 * @param {Object} docker - Docker 实例
 * @param {Object} config - 容器配置
 * @param {Object} logger - 日志记录器
 * @returns {string} 任务ID
 */
async function createContainerAsync(docker, config, logger = console) {
  const taskId = taskManager.createTask('container-create', { config });
  
  taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
    try {
      updateProgress(5, '准备创建');
      const { 
        image, 
        name, 
        env = [], 
        ports = {}, 
        volumes = {}, 
        volumePathTypes = {}, 
        cmd, 
        publicAccess, 
        performancePlan 
      } = config;
      
      // 确保镜像存在
      await ensureImageExists(docker, image, updateProgress, addLog);
      
      updateProgress(65, '构建容器配置');
      const containerConfig = {
        Image: image,
        name: name,
        Env: env.map(e => `${e.name}=${e.value}`),
        HostConfig: { PortBindings: {}, Binds: [] }
      };
      
      // 容器内统一以 root 用户运行
      containerConfig.User = '0:0';
      
      // 应用性能配置
      containerConfig.HostConfig = applyPerformancePreset(containerConfig.HostConfig, performancePlan);
      containerConfig.HostConfig.RestartPolicy = { Name: 'on-failure', MaximumRetryCount: 5 };
      
      // 端口配置
      const ipBindCreate = typeof publicAccess === 'boolean' ? (publicAccess ? '0.0.0.0' : '127.0.0.1') : '0.0.0.0';
      Object.keys(ports).forEach(containerPort => {
        const hostPort = ports[containerPort];
        const portKey = `${containerPort}/tcp`;
        containerConfig.HostConfig.PortBindings[portKey] = [{ HostIp: ipBindCreate, HostPort: hostPort.toString() }];
      });
      
      // 检查端口占用
      const busyPorts = await checkBusyPorts(ports, ipBindCreate);
      if (busyPorts.length) {
        addLog(`端口占用: ${busyPorts.join(',')}`);
        throw new Error(`端口占用: ${busyPorts.join(',')}`);
      }
      
      // 卷配置
      containerConfig.HostConfig.Binds = processVolumeBindings(volumes, volumePathTypes, name);
      
      // 启动命令
      if (cmd) {
        containerConfig.Cmd = Array.isArray(cmd) ? cmd : [cmd];
      }
      
      // 网络配置
      const networkConfig = await processNetworkConfig(docker, config, addLog);
      if (networkConfig && networkConfig.HostConfig) {
        containerConfig.HostConfig = {
          ...containerConfig.HostConfig,
          ...networkConfig.HostConfig
        };
      }
      if (networkConfig && networkConfig.NetworkingConfig) {
        containerConfig.NetworkingConfig = networkConfig.NetworkingConfig;
      }
      
      updateProgress(75, '创建容器');
      const container = await docker.createContainer(containerConfig);
      addLog(`容器创建: ${container.id}`);
      
      updateProgress(90, '启动容器');
      await docker.getContainer(container.id).start();
      addLog('容器启动完成');
      
      updateProgress(100, '创建完成');
    } catch (err) {
      addLog(`创建失败: ${err.message}`);
      throw err;
    }
  });
  
  return taskId;
}

module.exports = {
  createContainerAsync
};
