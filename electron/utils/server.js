const { fork } = require('child_process');
const path = require('path');
const net = require('net');
const { app } = require('electron'); // 引入 electron app 获取路径

class ServerManager {
    constructor(apiDir) {
        this.apiDir = apiDir;
        this.serverProcess = null;
        this.entryPoint = path.join(apiDir, 'server.js');
    }

    // 检测端口是否被占用
    checkPort(port) {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false); // 被占用
                } else {
                    reject(err);
                }
            });
            server.once('listening', () => {
                server.close();
                resolve(true); // 可用
            });
            server.listen(port);
        });
    }

    // 等待服务就绪
    waitForStart(port, timeout = 10000) {
        const start = Date.now();
        return new Promise((resolve, reject) => {
            const check = () => {
                const socket = new net.Socket();
                socket.setTimeout(200);
                socket.on('connect', () => {
                    socket.destroy();
                    resolve(true);
                });
                socket.on('timeout', () => {
                    socket.destroy();
                    retry();
                });
                socket.on('error', () => {
                    socket.destroy();
                    retry();
                });
                socket.connect(port, '127.0.0.1');
            };

            const retry = () => {
                if (Date.now() - start > timeout) {
                    reject(new Error('Server start timeout'));
                } else {
                    setTimeout(check, 500);
                }
            };

            check();
        });
    }

    // 启动服务，可以传入端口号
    start(onLog, port) {
        if (this.serverProcess) {
            return Promise.resolve();
        }

        console.log('[Server] Starting from:', this.entryPoint);
        
        // 关键：设置 ELECTRON_RUN_AS_NODE 环境变量，让 Electron 像普通 Node 一样运行脚本
        // 同时注入 APP_DATA_PATH 环境变量，将数据目录重定向到系统 AppData (避免升级覆盖)
        // 注入 XMP_SERVER_PORT 环境变量，确保端口设置生效，不受 API 内部 .env 文件影响
        const env = { 
            ...process.env, 
            ELECTRON_RUN_AS_NODE: '1',
            APP_DATA_PATH: app.getPath('userData'), // 注入数据路径
            XMP_SERVER_PORT: port // 注入专用端口变量，优先级最高
        };

        this.serverProcess = fork(this.entryPoint, [], {
            cwd: this.apiDir, // 确保 CWD 正确，否则相对路径读取会失败
            env: env,
            stdio: ['ignore', 'pipe', 'pipe', 'ipc']
        });

        if (this.serverProcess.stdout) {
            this.serverProcess.stdout.on('data', (data) => {
                const log = data.toString();
                // console.log('[API stdout]', log);
                if (onLog) onLog(log);
            });
        }

        if (this.serverProcess.stderr) {
            this.serverProcess.stderr.on('data', (data) => {
                const log = data.toString();
                console.error('[API stderr]', log);
                if (onLog) onLog(log, true);
            });
        }

        this.serverProcess.on('exit', (code) => {
            console.log(`[Server] Process exited with code ${code}`);
            this.serverProcess = null;
            if (onLog) onLog(`Process exited with code ${code}`, true);
        });

        return Promise.resolve();
    }

    stop() {
        return new Promise((resolve) => {
            if (!this.serverProcess) {
                resolve();
                return;
            }

            console.log('[Server] Stopping...');
            this.serverProcess.kill(); // SIGTERM
            this.serverProcess = null;
            setTimeout(resolve, 1000); // 稍微等待清理
        });
    }
}

module.exports = ServerManager;
