require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') });
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const app = express();

// 优先使用 Electron 注入的 XMP_SERVER_PORT，其次是 .env 中的 PORT，最后默认 3000
const PORT = process.env.XMP_SERVER_PORT || process.env.PORT || 3000;
let server = null;

const { setAppRoot } = require('./config/paths');

// 引入SSL证书生成函数
const generateSSLCert = require('./function/basic/generateSSLCert');
const { runMigrations } = require('./function/basic/migrate');
const { ensureCA, startClientCertWatcher } = require('./function/node/node-ca');

// 引入鉴权中间件
const { authMiddleware } = require('./middleware/auth');

// 引入路由
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const logRouter = require('./routes/log');
const setpanelRouter = require('./routes/setpanel');
const nodeRouter = require('./routes/node');
const forwardRouter = require('./routes/forward');
const mattersRouter = require('./routes/matters');
const sshTemplatesRouter = require('./routes/ssh-templates');
const xccRouter = require('./routes/xcc');
const certRouter = require('./routes/cert');
const phpRouter = require('./routes/php');


const HTML_DIR = path.join(__dirname, 'html');
const HTML_INDEX_PATH = path.join(HTML_DIR, 'index.html');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(HTML_DIR));

app.use(authMiddleware);

app.use('/', indexRouter);
app.use('/', authRouter);
app.use('/', logRouter);
app.use('/', setpanelRouter);
app.use('/', nodeRouter);
app.use('/', forwardRouter);
app.use('/', mattersRouter);
app.use('/', sshTemplatesRouter);
app.use('/', xccRouter);
app.use('/', certRouter);
app.use('/', phpRouter);



app.get('*', (req, res, next) => {
  const urlPath = req.path || '';
  if (urlPath.startsWith('/api')) {
    return next();
  }
  if (path.extname(urlPath)) {
    return next();
  }
  res.sendFile(HTML_INDEX_PATH);
});

// 启动HTTPS服务器的异步函数
async function startServer() {
  try {
    // 获取应用程序根目录（使用process.cwd()支持pkg打包）
    // 如果环境变量中有 APP_DATA_PATH (由Electron注入)，则优先使用该路径作为数据存储根目录
    // 这样可以确保数据存储在系统 AppData 目录，避免升级安装包时被覆盖
    const appRoot = process.env.APP_DATA_PATH || process.cwd();
    
    // 设置全局路径配置
    setAppRoot(appRoot);

    // 运行数据迁移
    await runMigrations();

    // 初始化 mTLS CA 证书
    await ensureCA();

    // 生成SSL证书
    console.log('正在生成SSL证书...');
    const { certPath, keyPath } = await generateSSLCert(appRoot);
    
    // 检查证书文件是否存在
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      throw new Error('SSL证书文件生成失败');
    }
    
    // 读取证书和私钥
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    
    // 创建HTTPS服务器
    server = https.createServer(options, app);

    // 由 forward 路由模块接管 WebSocket upgrade 以支持终端交互的WS转发
    if (typeof forwardRouter.attachUpgradeHandler === 'function') {
      forwardRouter.attachUpgradeHandler(server);
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
      console.log(`请使用 https://localhost:${PORT} 访问`);
    });

    startClientCertWatcher();
  } catch (error) {
    console.error('启动HTTPS服务器失败:', error);
    process.exit(1);
  }
}

let isShuttingDown = false;

function shutdown(code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const tasks = [];

  if (server) {
    tasks.push(new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    }));
  }

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
