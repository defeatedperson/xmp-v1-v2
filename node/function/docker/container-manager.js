/**
 * Docker容器管理类
 * 提供基础的容器生命周期管理功能
 */

const Docker = require('dockerode');
const { pullImageAsync } = require('./core/image-puller');
const { startContainer, stopContainer } = require('./core/container-controller');
const { createContainerAsync } = require('./core/container-creator');
const { upgradeContainerAsync } = require('./core/container-upgrader');
const { resolvePerformancePlanFromHostConfig } = require('./core/performance-presets');
const { createCleanBindsTask } = require('./core/container-cleaner');

class ContainerManager {
  constructor(options = {}) {
    this.docker = new Docker(options);
    this.logger = options.logger || console;
  }

  /**
   * 测试Docker连接
   * @returns {Promise<boolean>} 连接是否成功
   */
  async testConnection() {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      this.logger.error('Docker连接失败:', error.message);
      throw new Error(`Docker连接失败: ${error.message}`);
    }
  }

  /**
   * 异步拉取镜像
   * @param {string} imageName - 镜像名称 (如: "nginx:latest")
   * @returns {string} 任务ID
   */
  async pullImage(imageName) {
    return pullImageAsync(this.docker, imageName, this.logger);
  }

  /**
   * 启动容器
   * @param {string} containerId - 容器ID
   * @returns {Promise<Object>} 启动结果
   */
  async startContainer(containerId) {
    return startContainer(this.docker, containerId, this.logger);
  }

  /**
   * 停止容器
   * @param {string} containerId - 容器ID
   * @param {number} timeout - 超时时间(秒)
   * @returns {Promise<Object>} 停止结果
   */
  async stopContainer(containerId, timeout = 10) {
    return stopContainer(this.docker, containerId, timeout, this.logger);
  }

  /**
   * 升级容器（异步操作）
   * @param {string} containerId - 容器ID
   * @param {Object} newConfig - 新配置
   * @returns {Promise<Object>} 升级任务结果
   */
  async upgradeContainer(containerId, newConfig) {
    try {
      this.logger.log(`创建容器升级任务: ${containerId}`);
      
      // 调用异步升级功能
      const taskId = await this.upgradeContainerAsync(containerId, newConfig);
      
      this.logger.log(`容器升级任务已创建: ${taskId}`);
      
      return {
        success: true,
        message: '容器升级任务已创建，请使用任务ID查询升级进度',
        taskId: taskId,
        containerId: containerId
      };
    } catch (error) {
      this.logger.error(`创建升级任务失败: ${containerId}`, error);
      return {
        success: false,
        message: `创建升级任务失败: ${error.message}`,
        containerId: containerId
      };
    }
  }

  /**
   * 删除容器
   * @param {string} containerId - 容器ID
   * @param {boolean} force - 是否强制删除
   * @returns {Promise<Object>} 删除结果
   */
  async removeContainer(containerId, forceOrOptions = false) {
    try {
      this.logger.log(`正在删除容器: ${containerId}`);
      
      const container = this.docker.getContainer(containerId);
      
      try {
        const info = await container.inspect();
        const force = typeof forceOrOptions === 'boolean' ? forceOrOptions : !!(forceOrOptions && forceOrOptions.force);
        const removeVolumes = typeof forceOrOptions === 'object' ? !!forceOrOptions.removeVolumes : false;
        const cleanBinds = typeof forceOrOptions === 'object' ? !!forceOrOptions.cleanBinds : false;
        if (info.State.Running && !force) {
          throw new Error('容器正在运行，请先停止容器或使用force选项');
        }
        await container.remove({ force, v: removeVolumes });
        let cleanTaskId = null;
        if (cleanBinds) {
          const name = String(info.Name || '').replace(/^\//, '');
          try {
            cleanTaskId = await createCleanBindsTask(this.docker, name, this.logger);
            this.logger.log(`已创建挂载目录清理任务: ${cleanTaskId}`);
          } catch (e) {
            this.logger.error(`创建挂载目录清理任务失败: ${containerId}`, e);
            throw e;
          }
        }
        this.logger.log(`容器删除成功: ${containerId}`);
        return {
          success: true,
          message: cleanBinds && cleanTaskId ? '容器删除成功，已创建挂载目录清理任务' : '容器删除成功',
          containerId,
          cleanTaskId
        };
      } catch (error) {
        if (error && error.statusCode === 404) {
          this.logger.log(`容器不存在: ${containerId}`);
          return {
            success: true,
            message: '容器不存在',
            containerId
          };
        }
        throw error;
      }
    } catch (error) {
      this.logger.error(`删除容器失败: ${containerId}`, error);
      throw new Error(`删除容器失败: ${error.message}`);
    }
  }

  /**
   * 获取容器列表
   * @param {boolean} all - 是否显示所有容器（包括已停止的）
   * @returns {Promise<Array>} 容器列表
   */
  async listContainers(all = true) {
    try {
      const containers = await this.docker.listContainers({ all });
      
      return containers.map(container => ({
        containerId: container.Id,
        name: container.Names[0]?.replace('/', '') || '未命名',
        image: container.Image,
        status: container.Status,
        state: container.State,
        ports: container.Ports,
        created: container.Created
      }));
    } catch (error) {
      this.logger.error('获取容器列表失败:', error);
      throw new Error(`获取容器列表失败: ${error.message}`);
    }
  }

  /**
   * 获取容器信息
   * @param {string} containerId - 容器ID
   * @returns {Promise<Object>} 容器详细信息
   */
  async getContainerInfo(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      const perf = resolvePerformancePlanFromHostConfig(info.HostConfig);
      return {
        containerId: info.Id,
        name: info.Name.replace('/', ''),
        image: info.Config.Image,
        status: info.State.Status,
        running: info.State.Running,
        created: info.Created,
        started: info.State.StartedAt,
        ports: info.NetworkSettings.Ports,
        mounts: info.Mounts,
        env: info.Config.Env,
        performance: perf
      };
    } catch (error) {
      this.logger.error(`获取容器信息失败: ${containerId}`, error);
      throw new Error(`获取容器信息失败: ${error.message}`);
    }
  }

  async getContainerNetworks(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      const networks = info.NetworkSettings && info.NetworkSettings.Networks ? info.NetworkSettings.Networks : {};
      const result = Object.keys(networks).map(name => {
        const n = networks[name] || {};
        const ip = n.IPAddress || n.IPv4Address || '';
        const ipv6 = n.GlobalIPv6Address || n.IPv6Address || '';
        const ipPrefixLen = n.IPPrefixLen || n.IPv4PrefixLen || undefined;
        const ipv6PrefixLen = n.GlobalIPv6PrefixLen || n.IPv6PrefixLen || undefined;
        const ipCidr = ip && ipPrefixLen !== undefined ? `${ip}/${ipPrefixLen}` : (ip || '');
        const ipv6Cidr = ipv6 && ipv6PrefixLen !== undefined ? `${ipv6}/${ipv6PrefixLen}` : (ipv6 || '');
        return {
          name,
          networkId: n.NetworkID || '',
          endpointId: n.EndpointID || '',
          gateway: n.Gateway || '',
          ipv6Gateway: n.IPv6Gateway || '',
          ip: ip,
          ipCidr,
          ipv6: ipv6,
          ipv6Cidr,
          macAddress: n.MacAddress || '',
          aliases: Array.isArray(n.Aliases) ? n.Aliases : []
        };
      });
      return { success: true, containerId: info.Id, networks: result };
    } catch (error) {
      this.logger.error(`获取容器网络信息失败: ${containerId}`, error);
      throw new Error(`获取容器网络信息失败: ${error.message}`);
    }
  }

  async upgradeContainerAsync(containerId, newConfig) {
    return upgradeContainerAsync(this.docker, containerId, newConfig, this.logger);
  }

  async createContainerAsync(config) {
    return createContainerAsync(this.docker, config, this.logger);
  }
}

module.exports = ContainerManager;
