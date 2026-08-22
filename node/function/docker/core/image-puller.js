const { taskManager } = require('../../basic/task-manager');

/**
 * 异步拉取镜像
 * @param {Object} docker - Docker 实例
 * @param {string} imageName - 镜像名称 (如: "nginx:latest")
 * @param {Object} logger - 日志记录器
 * @returns {string} 任务ID
 */
async function pullImageAsync(docker, imageName, logger = console) {
  try {
    // 创建任务
    const taskId = taskManager.createTask('pull-image', { imageName });
    
    // 异步执行任务
    taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
      addLog(`开始拉取镜像: ${imageName}`);
      updateProgress(10, '准备拉取镜像');
      
      try {
        const stream = await docker.pull(imageName);
        updateProgress(20, '正在拉取镜像');
        
        return new Promise((resolve, reject) => {
          docker.modem.followProgress(stream, (err, res) => {
            if (err) {
              addLog(`镜像拉取失败: ${err.message}`);
              reject(err);
            } else {
              addLog('镜像拉取成功');
              updateProgress(100, '镜像拉取完成');
              resolve(res);
            }
          }, (event) => {
            if (event.status && event.status !== 'Pull complete') {
              addLog(event.status);
              
              // 根据事件状态更新进度
              if (event.status.includes('Pulling fs layer')) {
                updateProgress(30, '下载镜像层');
              } else if (event.status.includes('Waiting')) {
                updateProgress(40, '等待下载');
              } else if (event.status.includes('Downloading')) {
                const progress = event.progressDetail || {};
                if (progress.current && progress.total) {
                  const percent = Math.floor((progress.current / progress.total) * 50) + 40;
                  updateProgress(percent, `下载中: ${event.status}`);
                }
              } else if (event.status.includes('Extracting')) {
                const progress = event.progressDetail || {};
                if (progress.current && progress.total) {
                  const percent = Math.floor((progress.current / progress.total) * 30) + 70;
                  updateProgress(percent, `解压中: ${event.status}`);
                }
              }
            }
          });
        });
      } catch (error) {
        addLog(`拉取镜像异常: ${error.message}`);
        throw error;
      }
    });
    
    return taskId;
  } catch (error) {
    logger.error(`创建异步拉取镜像任务失败: ${imageName}`, error);
    throw new Error(`创建异步拉取镜像任务失败: ${error.message}`);
  }
}

module.exports = {
  pullImageAsync
};
