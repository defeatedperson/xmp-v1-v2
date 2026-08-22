/**
 * Docker容器管理模块
 * 提供基础的Docker容器操作功能
 */

const ContainerManager = require('./container-manager');
const DockerAdvancedManager = require('./docker-advanced-manager');
const DockerEngineManager = require('./docker-engine-manager');

// 创建默认实例
const dockerManager = new ContainerManager();
const dockerAdvancedManager = new DockerAdvancedManager();
const dockerEngineManager = new DockerEngineManager();

// 导出管理类和默认实例
module.exports = {
  ContainerManager,
  DockerAdvancedManager,
  DockerEngineManager,
  dockerManager,
  dockerAdvancedManager,
  dockerEngineManager
};
