require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') });
const express = require('express');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3001;
let server = null;
app.use(express.json());

// 引入路径配置
const { setAppRoot } = require('./config/paths');
const { closeDatabase } = require('./function/basic/log/database');
const { createDaemonClient } = require('./function/basic/daemon-client');

// 引入SSL证书管理
const { ensureCerts } = require('./function/auth/cert-manager');
const indexRouter = require('./router/index');
const fileRouter = require('./router/file');
const viewRouter = require('./router/view');
const monitorRouter = require('./router/monitor');
const processRouter = require('./router/process');
const logRouter = require('./router/log');
const dockerRouter = require('./router/docker');
const tasksRouter = require('./router/tasks');
const wsRouter = require('./router/ws');
const backupRouter = require('./router/backup');
const mysqlRouter = require('./router/mysql');
const redisRouter = require('./router/redis');
const websiteRouter = require('./router/website');
const sitesRouter = require('./router/sites');
const phpRouter = require('./router/php');
const scheduleRouter = require('./router/schedule');
const { startScheduleRunner } = require('./function/schedule/runner');

// 基本路由
app.use(indexRouter);
app.use(fileRouter);
app.use(viewRouter);
app.use(monitorRouter);
app.use(logRouter);
app.use('/docker', dockerRouter);
app.use('/backup', backupRouter);
app.use('/tasks', tasksRouter);
app.use('/processes', processRouter);
app.use('/mysql', mysqlRouter);
app.use('/redis', redisRouter);
app.use('/website', websiteRouter);
app.use('/sites', sitesRouter);
app.use('/php', phpRouter);
app.use(scheduleRouter);

// 启动HTTPS服务器的异步函数
async function startServer() {
  try {
    // 获取应用程序根目录（使用process.cwd()支持pkg打包）
    const appRoot = process.cwd();
    
    // 设置全局路径配置
    setAppRoot(appRoot);

    // 启用守护进程心跳上报：用于让守护进程确认 node-agent 仍在运行
    daemonClient = createDaemonClient({ service: 'node-agent' });
    daemonClient.startHeartbeat(30_000);
    
    // 验证必需的环境变量
    if (!process.env.NODE_ID) {
      throw new Error('缺少必需的环境变量：NODE_ID配置');
    }
    
    const options = await ensureCerts();
    
    // 创建HTTPS服务器
    server = https.createServer(options, app);
    if (typeof wsRouter.attachUpgradeHandler === 'function') {
      wsRouter.attachUpgradeHandler(server);
    }
    server.on('clientError', (err, socket) => {
      try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n') } catch {}
      try { console.error('clientError:', err && err.message) } catch {}
    })
    server.on('tlsClientError', (err, socket) => {
      try { console.error('tlsClientError:', err && err.message) } catch {}
      try { socket.destroy() } catch {}
    })
    server.on('error', (err) => {
      try { console.error('server error:', err && err.message) } catch {}
    })
    server.listen(PORT, () => {
      console.log(`HTTPS Server is running on port ${PORT}`);
    });
    try {
      startScheduleRunner({ logger: console });
    } catch (error) {
      console.error('启动计划任务调度器失败:', error && error.message ? error.message : error);
    }
  } catch (error) {
    console.error('启动HTTPS服务器失败:', error);
    process.exit(1);
  }
}

let isShuttingDown = false;
let daemonClient = null;

function shutdown(code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const tasks = [];

  try {
    if (daemonClient && typeof daemonClient.stopHeartbeat === 'function') {
      daemonClient.stopHeartbeat();
    }
  } catch {}

  if (server) {
    tasks.push(new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    }));
  }

  try {
    const p = closeDatabase();
    if (p && typeof p.then === 'function') {
      tasks.push(p.catch(() => {}));
    }
  } catch {}

  Promise.all(tasks).finally(() => {
    process.exit(code);
  });
}

process.on('SIGINT', () => {
  shutdown(0);
});

process.on('SIGTERM', () => {
  shutdown(0);
});

// 启动服务器
startServer();

module.exports = {
  app,
  PORT
};
