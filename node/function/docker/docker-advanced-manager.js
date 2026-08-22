/**
 * Docker高级管理类
 * 提供容器终端、存储卷和镜像列表功能
 */

const Docker = require('dockerode');
const Stream = require('stream');
const { taskManager } = require('../basic/task-manager');

class DockerAdvancedManager {
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
   * 在容器内执行命令
   * @param {string} containerId - 容器ID
   * @param {Array|string} cmd - 要执行的命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async executeCommand(containerId, cmd, options = {}) {
    try {
      const level = options.level || 'info';
      const quiet = options.quiet === true;
      if (!quiet && level !== 'silent') {
        this.logger.log(`在容器 ${containerId} 中执行命令: ${Array.isArray(cmd) ? cmd.join(' ') : cmd}`);
      }
      
      const container = this.docker.getContainer(containerId);
      
      // 确保容器在运行
      const containerInfo = await container.inspect();
      if (!containerInfo.State.Running) {
        throw new Error('容器未运行，无法执行命令');
      }
      
      // 创建执行实例
      const exec = await container.exec({
        Cmd: Array.isArray(cmd) ? cmd : [cmd],
        AttachStdin: options.attachStdin || false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: options.tty || false,
        Env: options.env || []
      });
      
      // 启动执行
      const stream = await exec.start({
        Detach: options.detach || false,
        Tty: options.tty || false
      });
      
      let output = '';
      let errorOutput = '';
      
      // 统一使用 PassThrough 流来处理输出，避免与 demuxStream 产生竞争
      const outStream = new Stream.PassThrough();
      const errStream = new Stream.PassThrough();

      outStream.on('data', (chunk) => {
        output += chunk.toString();
        if (!quiet) process.stdout.write(chunk);
      });

      errStream.on('data', (chunk) => {
        errorOutput += chunk.toString();
        if (!quiet) process.stderr.write(chunk);
      });

      // 安全地分流，demuxStream 负责解析 Docker 的混合流协议
      this.docker.modem.demuxStream(stream, outStream, errStream);
      
      return new Promise((resolve, reject) => {
        stream.on('end', async () => {
          try {
            const inspectData = await exec.inspect();
            
            resolve({
              success: inspectData.ExitCode === 0,
              exitCode: inspectData.ExitCode,
              output,
              errorOutput,
              containerId,
              command: cmd
            });
          } catch (err) {
            reject(new Error(`获取执行结果失败: ${err.message}`));
          }
        });
        
        stream.on('error', (err) => {
          reject(new Error(`命令执行失败: ${err.message}`));
        });
        
        // 如果需要输入
        if (options.stdin && stream.write) {
          stream.write(options.stdin);
          stream.end();
        }
      });
    } catch (error) {
      this.logger.error(`容器命令执行失败: ${containerId}`, error);
      throw new Error(`容器命令执行失败: ${error.message}`);
    }
  }

  async executeCommandAsync(containerId, cmd, options = {}) {
    const taskId = taskManager.createTask('container-exec', { containerId, cmd, options });
    taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
      updateProgress(5, '准备执行命令');
      const container = this.docker.getContainer(containerId);
      const containerInfo = await container.inspect();
      if (!containerInfo.State.Running) throw new Error('容器未运行，无法执行命令');
      const exec = await container.exec({
        Cmd: Array.isArray(cmd) ? cmd : [cmd],
        AttachStdin: options.attachStdin || false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: options.tty || false,
        Env: options.env || []
      });
      const stream = await exec.start({ Detach: options.detach || false, Tty: options.tty || false });
      updateProgress(20, '命令已启动');
      return new Promise((resolve, reject) => {
        let bytes = 0;
        stream.on('data', (chunk) => {
          bytes += chunk.length;
          addLog(chunk.toString());
          if (bytes % 8192 < chunk.length) updateProgress(Math.min(90, 20 + Math.floor(bytes / 1024)), '命令执行中');
        });
        stream.on('end', async () => {
          try {
            const inspectData = await exec.inspect();
            addLog(`退出码: ${inspectData.ExitCode}`);
            updateProgress(100, '命令执行完成');
            resolve(true);
          } catch (err) {
            reject(new Error(`获取执行结果失败: ${err.message}`));
          }
        });
        stream.on('error', (err) => {
          reject(new Error(`命令执行失败: ${err.message}`));
        });
        if (options.stdin && stream.write) {
          try { stream.write(options.stdin); stream.end(); } catch {}
        }
      });
    });
    return taskId;
  }

  async getContainerLogs(containerId, options = {}) {
    try {
      const stdout = options.stdout !== undefined ? options.stdout : true;
      const stderr = options.stderr !== undefined ? options.stderr : false;
      const tail = options.tail !== undefined ? options.tail : 500;
      const since = options.since;
      const timestamps = options.timestamps !== undefined ? options.timestamps : true;
      const container = this.docker.getContainer(containerId);
      const result = await container.logs({ stdout, stderr, follow: false, tail, since, timestamps });
      if (result && typeof result.on === 'function') {
        const out = new Stream.PassThrough();
        const err = new Stream.PassThrough();
        let outBuf = '';
        let errBuf = '';
        out.on('data', chunk => { outBuf += chunk.toString(); });
        err.on('data', chunk => { errBuf += chunk.toString(); });
        return new Promise((resolve, reject) => {
          this.docker.modem.demuxStream(result, out, err);
          result.on('end', () => {
            resolve({ success: true, containerId, tail, stdout: outBuf, stderr: errBuf });
          });
          result.on('error', err2 => {
            reject(new Error(`获取容器日志失败: ${err2.message}`));
          });
        });
      } else {
        let outBuf = '';
        let errBuf = '';
        if (Buffer.isBuffer(result)) {
          let offset = 0;
          while (offset + 8 <= result.length) {
            const type = result[offset];
            const length = result.readUInt32BE(offset + 4);
            const start = offset + 8;
            const end = start + length;
            if (end > result.length) break;
            const chunk = result.subarray(start, end).toString();
            if (type === 1) outBuf += chunk; else if (type === 2) errBuf += chunk; else outBuf += chunk;
            offset = end;
          }
          if (!outBuf && !errBuf && result.length > 0) {
            outBuf = result.toString();
          }
        } else if (typeof result === 'string') {
          outBuf = result;
        }
        return { success: true, containerId, tail, stdout: outBuf, stderr: errBuf };
      }
    } catch (error) {
      this.logger.error(`获取容器日志失败: ${containerId}`, error);
      throw new Error(`获取容器日志失败: ${error.message}`);
    }
  }

  /**
   * 创建交互式终端会话
   * @param {string} containerId - 容器ID
   * @param {Object} options - 终端选项
   * @returns {Promise<Object>} 终端会话信息
   */
  async createTerminalSession(containerId, options = {}) {
    try {
      
      
      const container = this.docker.getContainer(containerId);
      
      // 确保容器在运行
      const containerInfo = await container.inspect();
      if (!containerInfo.State.Running) {
        throw new Error('容器未运行，无法创建终端会话');
      }
      
      // 创建执行实例
      const exec = await container.exec({
        Cmd: options.shell || ['/bin/bash', '-i'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: [...(options.env || []), 'TERM=xterm-256color']
      });
      
      // 启动执行
      const stream = await exec.start({
        Detach: false,
        Tty: true,
        stdin: true
      });
      

      try {
        if (options.rows && options.cols) {
          await exec.resize({ h: options.rows, w: options.cols });
        }
      } catch {}
      
      return {
        success: true,
        containerId,
        execId: exec.id,
        stream,
        terminal: {
          rows: options.rows || 24,
          cols: options.cols || 80
        }
      };
    } catch (error) {
      this.logger.error(`创建终端会话失败: ${containerId}`, error);
      throw new Error(`创建终端会话失败: ${error.message}`);
    }
  }

  /**
   * 调整终端大小
   * @param {string} execId - 执行ID
   * @param {Object} size - 终端大小 {rows, cols}
   * @returns {Promise<Object>} 调整结果
   */
  async resizeTerminal(execId, size) {
    try {
      const exec = this.docker.getExec(execId);
      await exec.resize({
        h: size.rows,
        w: size.cols
      });
      
      return {
        success: true,
        message: '终端大小调整成功'
      };
    } catch (error) {
      this.logger.error(`调整终端大小失败: ${execId}`, error);
      throw new Error(`调整终端大小失败: ${error.message}`);
    }
  }

  /**
   * 获取本地镜像列表
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} 镜像列表
   */
  async listImages(filters = {}) {
    try {
      this.logger.log('获取本地镜像列表');
      
      const options = {};
      if (Object.keys(filters).length > 0) {
        options.filters = filters;
      }
      
      const images = await this.docker.listImages(options);
      
      return images.map(image => {
        const repoTags = image.RepoTags || ['<none>:<none>'];
        const repoDigests = image.RepoDigests || ['<none>@<none>'];
        
        return {
          id: image.Id,
          repoTags,
          repoDigests,
          created: image.Created,
          size: image.Size,
          labels: image.Labels || {},
          containers: image.Containers || 0,
          sharedSize: image.SharedSize || 0,
          virtualSize: image.VirtualSize || 0
        };
      });
    } catch (error) {
      this.logger.error('获取镜像列表失败:', error);
      throw new Error(`获取镜像列表失败: ${error.message}`);
    }
  }

  /**
   * 获取镜像详细信息
   * @param {string} imageId - 镜像ID或名称
   * @returns {Promise<Object>} 镜像详细信息
   */
  async getImageInfo(imageId) {
    try {
      this.logger.log(`获取镜像详细信息: ${imageId}`);
      
      const image = this.docker.getImage(imageId);
      const info = await image.inspect();
      const history = await image.history();
      
      return {
        id: info.Id,
        parent: info.Parent,
        comment: info.Comment,
        created: info.Created,
        container: info.Container,
        containerConfig: info.ContainerConfig,
        dockerVersion: info.DockerVersion,
        author: info.Author,
        config: info.Config,
        architecture: info.Architecture,
        os: info.Os,
        size: info.Size,
        virtualSize: info.VirtualSize,
        graphDriver: info.GraphDriver,
        rootFS: info.RootFS,
        metadata: info.Metadata,
        history: history.map(layer => ({
          id: layer.Id,
          created: layer.Created,
          createdBy: layer.CreatedBy,
          tags: layer.Tags,
          size: layer.Size,
          comment: layer.Comment
        }))
      };
    } catch (error) {
      this.logger.error(`获取镜像信息失败: ${imageId}`, error);
      throw new Error(`获取镜像信息失败: ${error.message}`);
    }
  }

  /**
   * 删除本地镜像
   * @param {string} imageId - 镜像ID或名称
   * @param {Object} options - 删除选项
   * @returns {Promise<Object>} 删除结果
   */
  async removeImage(imageId, options = {}) {
    try {
      this.logger.log(`删除镜像: ${imageId}`);
      
      const image = this.docker.getImage(imageId);
      const result = await image.remove({
        force: options.force || false,
        noprune: options.noprune || false
      });
      
      return {
        success: true,
        imageId,
        deleted: result.map(item => ({
          untagged: item.Untagged,
          deleted: item.Deleted
        }))
      };
    } catch (error) {
      const isConflict = error && error.statusCode === 409;
      const detail = String(error && error.json && error.json.message || error && error.message || '');
      const needForce = isConflict && /must be forced|referenced in multiple repositories/i.test(detail);
      if (needForce && !options.force) {
        const err = new Error('删除镜像失败，镜像被多个仓库引用。可尝试使用强制删除参数 force=true');
        err.statusCode = 409;
        err.reason = error.reason;
        err.json = error.json;
        this.logger.error(`删除镜像失败: ${imageId}`, err);
        throw err;
      }
      this.logger.error(`删除镜像失败: ${imageId}`, error);
      const err = new Error(`删除镜像失败: ${error.message}`);
      err.statusCode = error && error.statusCode ? error.statusCode : undefined;
      throw err;
    }
  }

  /**
   * 获取存储卷列表
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} 存储卷列表
   */
  async listVolumes(filters = {}) {
    try {
      this.logger.log('获取存储卷列表');
      
      const options = {};
      if (Object.keys(filters).length > 0) {
        options.filters = filters;
      }
      
      const volumes = await this.docker.listVolumes(options);
      
      return volumes.Volumes.map(volume => ({
        name: volume.Name,
        driver: volume.Driver,
        mountpoint: volume.Mountpoint,
        created: volume.CreatedAt,
        labels: volume.Labels || {},
        options: volume.Options || {},
        scope: volume.Scope,
        usage: {
          refCount: volume.UsageData ? volume.UsageData.RefCount : 0,
          size: volume.UsageData ? volume.UsageData.Size : 0
        }
      }));
    } catch (error) {
      this.logger.error('获取存储卷列表失败:', error);
      throw new Error(`获取存储卷列表失败: ${error.message}`);
    }
  }

  /**
   * 获取存储卷详细信息
   * @param {string} volumeName - 存储卷名称
   * @returns {Promise<Object>} 存储卷详细信息
   */
  async getVolumeInfo(volumeName) {
    try {
      this.logger.log(`获取存储卷详细信息: ${volumeName}`);
      
      const volume = this.docker.getVolume(volumeName);
      const info = await volume.inspect();
      
      return {
        name: info.Name,
        driver: info.Driver,
        mountpoint: info.Mountpoint,
        created: info.CreatedAt,
        labels: info.Labels || {},
        options: info.Options || {},
        scope: info.Scope,
        usage: {
          refCount: info.UsageData ? info.UsageData.RefCount : 0,
          size: info.UsageData ? info.UsageData.Size : 0
        }
      };
    } catch (error) {
      this.logger.error(`获取存储卷信息失败: ${volumeName}`, error);
      throw new Error(`获取存储卷信息失败: ${error.message}`);
    }
  }

  /**
   * 创建存储卷
   * @param {Object} config - 存储卷配置
   * @returns {Promise<Object>} 创建结果
   */
  async createVolume(config) {
    try {
      const { name, driver = 'local', driverOpts = {}, labels = {} } = config;
      
      this.logger.log(`创建存储卷: ${name || '未命名'}`);
      
      const volumeConfig = {
        Name: name,
        Driver: driver,
        DriverOpts: driverOpts,
        Labels: labels
      };
      
      const volume = await this.docker.createVolume(volumeConfig);
      
      this.logger.log(`存储卷创建成功: ${volume.name}`);
      
      return {
        success: true,
        volumeName: volume.name,
        volume: volume
      };
    } catch (error) {
      this.logger.error('创建存储卷失败:', error);
      throw new Error(`创建存储卷失败: ${error.message}`);
    }
  }

  /**
   * 删除存储卷
   * @param {string} volumeName - 存储卷名称
   * @param {boolean} force - 是否强制删除
   * @returns {Promise<Object>} 删除结果
   */
  async removeVolume(volumeName, force = false) {
    try {
      this.logger.log(`删除存储卷: ${volumeName}`);
      
      const volume = this.docker.getVolume(volumeName);
      
      try {
        await volume.inspect();
      } catch (error) {
        if (error.statusCode === 404) {
          this.logger.log(`存储卷不存在: ${volumeName}`);
          return {
            success: true,
            message: '存储卷不存在',
            volumeName
          };
        }
        throw error;
      }
      
      await volume.remove({ force });
      
      this.logger.log(`存储卷删除成功: ${volumeName}`);
      
      return {
        success: true,
        message: '存储卷删除成功',
        volumeName
      };
    } catch (error) {
      this.logger.error(`删除存储卷失败: ${volumeName}`, error);
      throw new Error(`删除存储卷失败: ${error.message}`);
    }
  }

  /**
   * 清理Docker构建缓存
   * @returns {Promise<Object>} 清理结果
   */
  async pruneResources() {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    try {
      this.logger.log('开始清理Docker构建缓存');
      
      // 执行docker builder prune命令清理构建缓存
      const { stdout, stderr } = await execPromise('docker builder prune -f');
      
      this.logger.log('Docker构建缓存清理完成');
      
      return {
        success: true,
        message: '构建缓存清理成功',
        stdout: stdout || '',
        stderr: stderr || ''
      };
    } catch (error) {
      this.logger.error('构建缓存清理失败:', error);
      throw new Error(`构建缓存清理失败: ${error.message}`);
    }
  }

  async listNetworks(filters = {}) {
    try {
      const options = {};
      if (Object.keys(filters).length > 0) options.filters = filters;
      const networks = await this.docker.listNetworks(options);
      return networks.map(n => ({
        id: n.Id,
        name: n.Name,
        driver: n.Driver,
        scope: n.Scope,
        enableIPv6: n.EnableIPv6 || false,
        internal: n.Internal || false,
        attachable: n.Attachable || false,
        ingress: n.Ingress || false,
        labels: n.Labels || {},
        containers: n.Containers ? Object.keys(n.Containers).length : 0
      }));
    } catch (error) {
      this.logger.error('获取网络列表失败:', error);
      throw new Error(`获取网络列表失败: ${error.message}`);
    }
  }

  async getNetworkInfo(networkId) {
    try {
      const network = this.docker.getNetwork(networkId);
      const info = await network.inspect();
      return {
        id: info.Id,
        name: info.Name,
        created: info.Created,
        driver: info.Driver,
        scope: info.Scope,
        options: info.Options || {},
        labels: info.Labels || {},
        attachable: info.Attachable || false,
        ingress: info.Ingress || false,
        internal: info.Internal || false,
        enableIPv6: info.EnableIPv6 || false,
        containers: info.Containers || {}
      };
    } catch (error) {
      this.logger.error(`获取网络信息失败: ${networkId}`, error);
      throw new Error(`获取网络信息失败: ${error.message}`);
    }
  }

  async createNetwork(config) {
    try {
      const name = config.name;
      const driver = config.driver || 'bridge';
      const options = config.options || {};
      const labels = config.labels || {};
      const payload = { Name: name, Driver: driver, Options: options, Labels: labels };

      // 支持IPv4 IPAM配置（子网/网关）
      if (config.ipam) {
        const ipam = config.ipam;
        const ipamDriver = ipam.driver || 'default';
        let ipamConfigs = [];

        if (Array.isArray(ipam.config)) {
          ipamConfigs = ipam.config
            .map(c => ({
              Subnet: c.subnet,
              Gateway: c.gateway,
            }))
            .filter(c => c.Subnet || c.Gateway);
        } else if (ipam.subnet || ipam.gateway) {
          ipamConfigs = [{ Subnet: ipam.subnet, Gateway: ipam.gateway }];
        }

        if (ipamConfigs.length > 0) {
          payload.IPAM = { Driver: ipamDriver, Config: ipamConfigs };
        }
      }

      const net = await this.docker.createNetwork(payload);
      return { success: true, networkId: net.id || net.Id || name };
    } catch (error) {
      this.logger.error('创建网络失败:', error);
      throw new Error(`创建网络失败: ${error.message}`);
    }
  }

  async connectContainerToNetwork(networkId, params = {}) {
    try {
      const network = this.docker.getNetwork(networkId);
      await network.connect({ Container: params.containerId, EndpointConfig: params.endpointConfig || {} });
      return { success: true, message: '容器已连接到网络', networkId, containerId: params.containerId };
    } catch (error) {
      this.logger.error(`网络连接容器失败: ${networkId}`, error);
      throw new Error(`网络连接容器失败: ${error.message}`);
    }
  }

  async disconnectContainerFromNetwork(networkId, params = {}) {
    try {
      const network = this.docker.getNetwork(networkId);
      await network.disconnect({ Container: params.containerId, Force: params.force || false });
      return { success: true, message: '容器已从网络断开', networkId, containerId: params.containerId };
    } catch (error) {
      this.logger.error(`网络断开容器失败: ${networkId}`, error);
      throw new Error(`网络断开容器失败: ${error.message}`);
    }
  }

  async removeNetwork(networkId) {
    try {
      const network = this.docker.getNetwork(networkId);
      const info = await network.inspect();
      const used = info.Containers && Object.keys(info.Containers).length > 0;
      if (used) throw new Error('网络存在已连接容器，无法删除');
      await network.remove();
      return { success: true, message: '网络删除成功', networkId };
    } catch (error) {
      this.logger.error(`删除网络失败: ${networkId}`, error);
      throw new Error(`删除网络失败: ${error.message}`);
    }
  }

  async pruneResourcesAsync() {
    const taskId = taskManager.createTask('docker-prune', {});
    taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
      updateProgress(10, '开始清理');
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      const { stdout, stderr } = await execPromise('docker builder prune -f');
      if (stdout) addLog(stdout.trim());
      if (stderr) addLog(stderr.trim());
      updateProgress(100, '清理完成');
    });
    return taskId;
  }
}

module.exports = DockerAdvancedManager;
