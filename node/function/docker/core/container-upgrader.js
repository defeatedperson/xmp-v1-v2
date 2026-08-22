const { taskManager } = require('../../basic/task-manager');
const { 
  extractContainerConfig, 
  mergeUpgradeConfig, 
  inferDefaultIp, 
  processPortConfig, 
  processNetworkConfig 
} = require('./config-extractor');
const { applyPerformancePreset } = require('./performance-presets');
const { startContainer, stopContainer } = require('./container-controller');

/**
 * 检查升级任务冲突
 * @param {string} containerId - 容器ID
 * @returns {boolean} 是否存在冲突
 */
function checkUpgradeConflict(containerId) {
  const allTasks = taskManager.getAllTasks('container-upgrade') || [];
  return allTasks.some(task => {
    if (!task) return false;
    if (task.status !== 'pending' && task.status !== 'running') return false;
    const data = task.data || {};
    return data && data.containerId === containerId;
  });
}

/**
 * 执行容器回滚
 * @param {Object} docker - Docker客户端
 * @param {string} oldContainerId - 旧容器ID
 * @param {string} newContainerId - 新容器ID
 * @param {Object} logger - 日志记录器
 */
async function rollbackOnFailure(docker, oldContainerId, newContainerId, logger) {
  logger.log(`新容器创建/启动失败，尝试回滚`);
  
  try {
    if (newContainerId) {
      try { 
        await stopContainer(docker, newContainerId); 
      } catch {}
      try { 
        await docker.getContainer(newContainerId).remove({ force: true }); 
      } catch {}
    }
    
    await startContainer(docker, oldContainerId);
    logger.log('已回滚到旧容器');
  } catch (re) {
    logger.log(`回滚失败: ${re.message}`);
  }
}

/**
 * 构建升级容器配置
 * @param {Object} config - 配置对象
 * @param {Object} oldInfo - 旧容器信息
 * @returns {Object} 容器配置
 */
function buildUpgradeContainerConfig(config, oldInfo) {
  const { image, env = [], cmd, publicAccess, performancePlan } = config;
  
  const containerConfig = {
    Image: image,
    Env: (env || []).map(e => typeof e === 'string' ? e : `${e.name}=${e.value}`),
    HostConfig: { PortBindings: {}, Binds: [] }
  };

  // 容器内统一以 root 用户运行
  containerConfig.User = '0:0';

  // 应用性能配置
  containerConfig.HostConfig = applyPerformancePreset(containerConfig.HostConfig, performancePlan);
  containerConfig.HostConfig.RestartPolicy = { Name: 'on-failure', MaximumRetryCount: 5 };

  // 推断默认IP绑定地址
  const defaultIp = inferDefaultIp(oldInfo.HostConfig && oldInfo.HostConfig.PortBindings);
  containerConfig.defaultIp = defaultIp;

  // 启动命令
  if (cmd) {
    containerConfig.Cmd = Array.isArray(cmd) ? cmd : [cmd];
  }

  return containerConfig;
}

/**
 * 执行容器升级的核心逻辑
 * @param {Object} docker - Docker客户端
 * @param {string} containerId - 容器ID
 * @param {Object} newConfig - 新配置
 * @param {Object} logger - 日志记录器
 * @returns {string} 任务ID
 */
async function performContainerUpgrade(docker, containerId, newConfig, logger) {
  const taskId = taskManager.createTask('container-upgrade', { containerId, newConfig });

  taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
    try {
      updateProgress(5, '准备升级');
      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      // 提取并合并配置
      const currentConfig = extractContainerConfig(info);
      const finalConfig = mergeUpgradeConfig(currentConfig, newConfig);

      try {
        await docker.getImage(finalConfig.image).inspect();
        addLog(`镜像已存在: ${finalConfig.image}`);
        updateProgress(10, '检查镜像完成');
      } catch {
        addLog(`开始拉取镜像: ${finalConfig.image}`);
        updateProgress(10, '准备拉取镜像');
        try {
          const stream = await docker.pull(finalConfig.image);
          updateProgress(20, '正在拉取镜像');
          await new Promise((resolve, reject) => {
            docker.modem.followProgress(
              stream,
              (err, res) => {
                if (err) {
                  addLog(`镜像拉取失败: ${err.message}`);
                  reject(err);
                } else {
                  addLog('镜像拉取成功');
                  updateProgress(45, '镜像拉取完成');
                  resolve(res);
                }
              },
              event => {
                if (event && event.status && event.status !== 'Pull complete') {
                  addLog(event.status);
                  if (event.status.includes('Pulling fs layer')) {
                    updateProgress(25, '下载镜像层');
                  } else if (event.status.includes('Waiting')) {
                    updateProgress(30, '等待下载');
                  } else if (event.status.includes('Downloading')) {
                    const progress = event.progressDetail || {};
                    if (progress.current && progress.total) {
                      const percent = Math.min(
                        40,
                        Math.floor((progress.current / progress.total) * 20) + 25
                      );
                      updateProgress(percent, `下载中: ${event.status}`);
                    }
                  } else if (event.status.includes('Extracting')) {
                    const progress = event.progressDetail || {};
                    if (progress.current && progress.total) {
                      const percent = Math.min(
                        45,
                        Math.floor((progress.current / progress.total) * 20) + 25
                      );
                      updateProgress(percent, `解压中: ${event.status}`);
                    }
                  }
                }
              }
            );
          });
        } catch (e) {
          addLog(`拉取镜像异常: ${e.message}`);
          throw e;
        }
      }

      await performActualUpgrade(docker, containerId, finalConfig, info, logger, updateProgress, addLog);

    } catch (err) {
      addLog(`升级失败: ${err.message}`);
      throw err;
    }
  });

  return taskId;
}

/**
 * 执行实际的容器升级流程
 */
async function performActualUpgrade(docker, containerId, finalConfig, oldInfo, logger, updateProgress, addLog) {
  // 停止旧容器
  addLog('停止旧容器');
  updateProgress(25, '停止容器');
  await stopContainer(docker, containerId);

  // 构建新容器配置
  addLog('构建容器配置');
  updateProgress(45, '构建容器配置');
  const containerConfig = buildUpgradeContainerConfig(finalConfig, oldInfo);

  // 处理端口配置
  const defaultIp = containerConfig.defaultIp || '0.0.0.0';
  const ipBindUpgrade = typeof finalConfig.publicAccess === 'boolean' 
    ? (finalConfig.publicAccess ? '0.0.0.0' : '127.0.0.1') 
    : defaultIp;

  const { portBindings, busyPorts } = await processPortConfig(finalConfig.ports, ipBindUpgrade);
  containerConfig.HostConfig.PortBindings = portBindings;

  if (busyPorts.length) {
    addLog(`端口占用: ${busyPorts.join(',')}`);
    throw new Error(`端口占用: ${busyPorts.join(',')}`);
  }

  // 保留原有卷绑定
  const originalBinds = oldInfo.HostConfig && Array.isArray(oldInfo.HostConfig.Binds) 
    ? oldInfo.HostConfig.Binds 
    : [];
  containerConfig.HostConfig.Binds = originalBinds.slice();

  // 处理网络配置
  const networkConfig = await processNetworkConfig(docker, finalConfig);
  if (networkConfig.NetworkMode) {
    containerConfig.HostConfig.NetworkMode = networkConfig.NetworkMode;
  }
  if (networkConfig.NetworkingConfig) {
    containerConfig.NetworkingConfig = networkConfig.NetworkingConfig;
  }

  if (!containerConfig.HostConfig.NetworkMode && oldInfo.HostConfig && oldInfo.HostConfig.NetworkMode === 'host') {
    containerConfig.HostConfig.NetworkMode = 'host';
  }

  let newContainer = null;
  try {
    // 创建新容器
    updateProgress(60, '创建容器');
    newContainer = await docker.createContainer(containerConfig);
    addLog(`启动新容器: ${newContainer.id}`);

    // 启动新容器
    updateProgress(80, '启动容器');
    await docker.getContainer(newContainer.id).start();

    // 删除旧容器
    addLog('删除旧容器');
    updateProgress(90, '删除旧容器');
    await docker.getContainer(containerId).remove({ force: true });

    // 重命名新容器
    if (finalConfig.name) {
      try {
        await docker.getContainer(newContainer.id).rename({ name: finalConfig.name });
        addLog(`重命名新容器为: ${finalConfig.name}`);
      } catch (e) {
        addLog(`重命名失败: ${e.message}`);
      }
    }

    addLog('升级完成');
    updateProgress(100, '升级完成');

  } catch (e) {
    addLog(`新容器创建/启动失败，尝试回滚: ${e.message}`);
    await rollbackOnFailure(docker, containerId, newContainer ? newContainer.id : null, logger);
    throw e;
  }
}

/**
 * 异步升级容器
 * @param {Object} docker - Docker客户端
 * @param {string} containerId - 容器ID
 * @param {Object} newConfig - 新配置
 * @param {Object} logger - 日志记录器
 * @returns {string} 任务ID
 */
async function upgradeContainerAsync(docker, containerId, newConfig, logger = console) {
  // 检查升级冲突
  const hasConflict = checkUpgradeConflict(containerId);
  
  if (hasConflict) {
    const taskId = taskManager.createTask('container-upgrade', { containerId, newConfig });
    
    taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
      updateProgress(100, '已有进行中的升级任务，本次请求已跳过');
      addLog(`跳过容器 ${containerId} 的升级请求：已有同容器升级任务正在执行`);
      throw new Error('已有进行中的升级任务');
    });
    
    return taskId;
  }

  return performContainerUpgrade(docker, containerId, newConfig, logger);
}

module.exports = {
  upgradeContainerAsync,
  checkUpgradeConflict,
  rollbackOnFailure,
  buildUpgradeContainerConfig,
  performContainerUpgrade
};
