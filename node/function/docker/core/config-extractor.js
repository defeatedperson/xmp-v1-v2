const net = require('net');

/**
 * 从现有容器信息中提取配置
 * @param {Object} info - 容器检查信息
 * @returns {Object} 提取的配置对象
 */
function extractContainerConfig(info) {
  const currentConfig = {
    image: info.Config.Image,
    name: info.Name.replace('/', ''),
    env: info.Config.Env,
    ports: {},
    volumes: {},
    networkMode: '',
    network: '',
    networks: []
  };

  // 提取端口配置
  if (info.HostConfig && info.HostConfig.PortBindings) {
    Object.keys(info.HostConfig.PortBindings).forEach(key => {
      const binding = info.HostConfig.PortBindings[key][0];
      const containerPort = key.replace('/tcp', '');
      currentConfig.ports[containerPort] = parseInt(binding.HostPort);
    });
  }

  // 提取卷配置
  if (info.HostConfig && info.HostConfig.Binds) {
    info.HostConfig.Binds.forEach(bind => {
      const [hostPath, containerPath] = bind.split(':');
      currentConfig.volumes[hostPath] = containerPath;
    });
  }

  if (info.HostConfig && typeof info.HostConfig.NetworkMode === 'string') {
    currentConfig.networkMode = info.HostConfig.NetworkMode;
  }

  if (info.NetworkSettings && info.NetworkSettings.Networks && typeof info.NetworkSettings.Networks === 'object') {
    const names = Object.keys(info.NetworkSettings.Networks).filter(Boolean);
    if (names.length === 1) {
      currentConfig.network = names[0];
    }
    currentConfig.networks = names;
  }

  return currentConfig;
}

/**
 * 合并当前配置和新配置
 * @param {Object} currentConfig - 当前配置
 * @param {Object} newConfig - 新配置
 * @returns {Object} 合并后的配置
 */
function mergeUpgradeConfig(currentConfig, newConfig) {
  const finalConfig = { ...currentConfig, ...newConfig };
  
  // 确保环境变量格式统一
  if (finalConfig.env) {
    finalConfig.env = finalConfig.env.map(e => 
      typeof e === 'string' ? e : `${e.name}=${e.value}`
    );
  }
  
  return finalConfig;
}

/**
 * 从端口绑定中推断默认IP地址
 * @param {Object} portBindings - 端口绑定配置
 * @returns {string} 推断的IP地址
 */
function inferDefaultIp(portBindings) {
  try {
    const ips = Object.keys(portBindings || {}).map(k => {
      const binding = portBindings[k];
      return (binding && binding[0] && binding[0].HostIp) || '';
    }).filter(Boolean);
    
    if (ips.includes('127.0.0.1')) return '127.0.0.1';
  } catch {}
  return '0.0.0.0';
}

/**
 * 处理端口配置并检测占用
 * @param {Object} ports - 端口配置
 * @param {string} ipBind - IP绑定地址
 * @returns {Promise<Object>} { portBindings, busyPorts }
 */
async function processPortConfig(ports, ipBind) {
  const portBindings = {};
  const busyPorts = [];

  Object.keys(ports || {}).forEach(containerPort => {
    const hostPort = ports[containerPort];
    const portKey = `${containerPort}/tcp`;
    portBindings[portKey] = [{ HostIp: ipBind, HostPort: String(hostPort) }];
  });

  // 检测端口占用
  for (const containerPort of Object.keys(ports || {})) {
    const hostPort = Number(ports[containerPort]);
    if (!Number.isNaN(hostPort)) {
      const s = new net.Server();
      await new Promise(r => {
        s.once('error', err => { 
          if (err && err.code === 'EADDRINUSE') busyPorts.push(hostPort); 
          r(); 
        });
        s.listen(hostPort, ipBind, () => { s.close(() => r()); });
      });
    }
  }

  return { portBindings, busyPorts };
}

/**
 * 处理网络配置
 * @param {Object} docker - Docker客户端
 * @param {Object} networkConfig - 网络配置
 * @returns {Promise<Object>} 网络配置对象
 */
async function processNetworkConfig(docker, networkConfig) {
  const { networkMode, network, networks } = networkConfig;
  
  if (networkMode === 'host' || network === 'host') {
    return { NetworkMode: 'host' };
  }

  const names = [];
  if (typeof network === 'string' && network) names.push(network);
  if (Array.isArray(networks)) names.push(...networks.filter(Boolean));

  if (!names.length) {
    return {};
  }

  const list = await docker.listNetworks();
  const available = new Set((list || []).map(n => n.Name));
  const missing = names.filter(n => !available.has(n));

  if (missing.length) {
    throw new Error(`指定网络不存在: ${missing.join(',')}`);
  }

  const networkingConfig = { EndpointsConfig: {} };
  names.forEach(n => { 
    networkingConfig.EndpointsConfig[n] = {}; 
  });

  return { NetworkingConfig: networkingConfig };
}

module.exports = {
  extractContainerConfig,
  mergeUpgradeConfig,
  inferDefaultIp,
  processPortConfig,
  processNetworkConfig
};
