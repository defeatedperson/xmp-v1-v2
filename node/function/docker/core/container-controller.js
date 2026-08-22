/**
 * 容器控制功能模块
 * 提供容器启动和停止的基础功能
 */

/**
 * 启动容器
 * @param {Object} docker - Docker 实例
 * @param {string} containerId - 容器ID
 * @param {Object} logger - 日志记录器
 * @returns {Promise<Object>} 启动结果
 */
async function startContainer(docker, containerId, logger = console) {
  try {
    logger.log(`正在启动容器: ${containerId}`);
    
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    
    if (info.State.Running) {
      logger.log(`容器已经在运行: ${containerId}`);
      return {
        success: true,
        message: '容器已经在运行',
        containerId
      };
    }
    
    await container.start();
    
    logger.log(`容器启动成功: ${containerId}`);
    
    return {
      success: true,
      message: '容器启动成功',
      containerId
    };
  } catch (error) {
    logger.error(`启动容器失败: ${containerId}`, error);
    throw new Error(`启动容器失败: ${error.message}`);
  }
}

/**
 * 停止容器
 * @param {Object} docker - Docker 实例
 * @param {string} containerId - 容器ID
 * @param {number} timeout - 超时时间(秒)
 * @param {Object} logger - 日志记录器
 * @returns {Promise<Object>} 停止结果
 */
async function stopContainer(docker, containerId, timeout = 10, logger = console) {
  try {
    logger.log(`正在停止容器: ${containerId}`);
    
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    
    if (!info.State.Running) {
      logger.log(`容器已经停止: ${containerId}`);
      return {
        success: true,
        message: '容器已经停止',
        containerId
      };
    }
    
    await container.stop({ t: timeout });
    
    logger.log(`容器停止成功: ${containerId}`);
    
    return {
      success: true,
      message: '容器停止成功',
      containerId
    };
  } catch (error) {
    logger.error(`停止容器失败: ${containerId}`, error);
    throw new Error(`停止容器失败: ${error.message}`);
  }
}

module.exports = {
  startContainer,
  stopContainer
};