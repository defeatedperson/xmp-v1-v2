const { taskManager } = require('../basic/task-manager');
const { createDaemonClient } = require('../basic/daemon-client');

class DockerEngineManager {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.service = options.service || 'node-agent';
    this.daemonClient = options.daemonClient || createDaemonClient({ service: this.service, logger: this.logger });
  }

  async restartDocker() {
    const ok = await this.daemonClient.restartDocker();
    if (!ok) throw new Error('请求守护进程重启Docker失败');
    return { requested: true };
  }

  async restartDockerAsync() {
    const taskId = taskManager.createTask('engine-restart', {});
    taskManager.executeTask(taskId, async (_taskId, updateProgress, addLog) => {
      updateProgress(10, '请求守护进程重启引擎');
      addLog('发送重启请求到守护进程');
      await this.restartDocker();
      updateProgress(100, '重启请求已提交，请前往日志查看重启状态');
    });
    return taskId;
  }
}

module.exports = DockerEngineManager;
