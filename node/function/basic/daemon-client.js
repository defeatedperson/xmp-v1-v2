const net = require('net');
const fs = require('fs');
const path = require('path');
const paths = require('../../config/paths');

/**
 * 创建守护进程通信客户端（Unix Domain Socket）。
 *
 * 说明：
 * - 守护进程按“每行一个JSON”的方式读取请求（NDJSON），不返回响应。
 * - 本模块采用“短连接”策略：每次发送一条消息就连接、写入、关闭。
 * - 守护进程仅用心跳确认进程“存活”，不做额外健康分析；并处理重启/权限修复请求。
 *
 * @param {object} options
 * @param {string} options.service - 服务名（必须与守护进程登记一致，例如 "node-agent"）
 * @param {string} [options.sockPath] - Socket 文件路径（默认：appRoot/daemon.sock 或 cwd/daemon.sock）
 * @param {number} [options.pid] - 进程PID（默认：process.pid）
 * @param {number} [options.writeTimeoutMs] - 单次写入超时（默认：1500ms）
 * @param {number} [options.logCooldownMs] - 错误日志冷却时间（默认：10000ms）
 * @param {Console} [options.logger] - 日志输出（默认：console）
 */
function createDaemonClient(options = {}) {
  const service = String(options.service || '').trim();
  if (!service) {
    throw new Error('createDaemonClient: service不能为空');
  }

  const pid = Number.isInteger(options.pid) ? options.pid : process.pid;
  const sockPath = options.sockPath || resolveDefaultSockPath();
  const writeTimeoutMs = Number.isFinite(options.writeTimeoutMs) ? options.writeTimeoutMs : 1500;
  const logCooldownMs = Number.isFinite(options.logCooldownMs) ? options.logCooldownMs : 10_000;
  const logger = options.logger || console;

  let heartbeatTimer = null;
  let lastLogAt = 0;

  function logOnce(message, error) {
    const now = Date.now();
    if (now - lastLogAt < logCooldownMs) return;
    lastLogAt = now;
    if (error) {
      logger.warn(message, error && error.message ? error.message : error);
      return;
    }
    logger.warn(message);
  }

  function makeRequestLine(type) {
    return JSON.stringify({ type, service, pid }) + '\n';
  }

  /**
   * 发送一条消息到守护进程。
   * 守护进程不返回响应，所以这里以“写入完成/连接关闭”为成功标准。
   *
   * @param {string} type - 请求类型：heartbeat | restart-self | restart-docker | check-web-perm
   * @returns {Promise<void>}
   */
  function send(type) {
    if (process.platform === 'win32') {
      return Promise.reject(new Error('当前平台不支持Unix Domain Socket通信'));
    }

    const line = makeRequestLine(type);

    return new Promise((resolve, reject) => {
      let finished = false;
      const socket = net.createConnection({ path: sockPath });

      const finish = (err) => {
        if (finished) return;
        finished = true;
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        if (err) reject(err);
        else resolve();
      };

      const timer = setTimeout(() => {
        finish(new Error(`写入守护进程超时: ${writeTimeoutMs}ms`));
      }, writeTimeoutMs);

      socket.once('connect', () => {
        socket.write(line, 'utf8', (err) => {
          clearTimeout(timer);
          if (err) return finish(err);
          socket.end();
          finish();
        });
      });

      socket.once('error', (err) => {
        clearTimeout(timer);
        finish(err);
      });
    });
  }

  /**
   * 上报“我还活着”的心跳。
   * @returns {Promise<boolean>} 成功返回true，失败返回false（不中断主流程）
   */
  async function heartbeat() {
    try {
      await send('heartbeat');
      return true;
    } catch (error) {
      logOnce(`心跳发送失败: ${sockPath}`, error);
      return false;
    }
  }

  /**
   * 请求守护进程重启本服务（守护进程会校验service与pid匹配）。
   * @returns {Promise<boolean>}
   */
  async function restartSelf() {
    try {
      await send('restart-self');
      return true;
    } catch (error) {
      logOnce(`重启请求发送失败: ${sockPath}`, error);
      return false;
    }
  }

  /**
   * 请求守护进程重启Docker引擎（守护进程会校验service与pid匹配）。
   * @returns {Promise<boolean>}
   */
  async function restartDocker() {
    try {
      await send('restart-docker');
      return true;
    } catch (error) {
      logOnce(`Docker重启请求发送失败: ${sockPath}`, error);
      return false;
    }
  }

  /**
   * 请求守护进程检查并修复Web目录权限（守护进程会校验service与pid匹配）。
   * @returns {Promise<boolean>}
   */
  async function checkWebPerm() {
    try {
      await send('check-web-perm');
      return true;
    } catch (error) {
      logOnce(`Web权限修复请求发送失败: ${sockPath}`, error);
      return false;
    }
  }

  /**
   * 启动周期性心跳上报（默认30秒一次）。
   * 注意：重复调用会先停止旧的定时器再启动新的。
   *
   * @param {number} [intervalMs=30000]
   * @returns {NodeJS.Timeout}
   */
  function startHeartbeat(intervalMs = 30_000) {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, intervalMs);
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
    return heartbeatTimer;
  }

  /**
   * 停止周期性心跳上报。
   */
  function stopHeartbeat() {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  /**
   * 读取守护进程日志（只读）。
   *
   * 说明：
   * - 守护进程日志由守护进程自身写入并轮转，本方法仅提供读取（常用于前端展示/诊断）。
   * - 读取采用“从文件末尾向前读”，避免日志很大时一次性读入内存。
   *
   * @param {object} [options]
   * @param {number} [options.tailLines=200] - 读取末尾行数
   * @param {number} [options.maxBytes=262144] - 最多读取字节数（默认256KB）
   * @param {string} [options.encoding='utf8'] - 文本编码
   * @returns {Promise<{ path: string, exists: boolean, lines: string[] }>}
   */
  async function readDaemonLog(options = {}) {
    const tailLines = Number.isFinite(options.tailLines) ? Math.max(1, Math.floor(options.tailLines)) : 200;
    const maxBytes = Number.isFinite(options.maxBytes) ? Math.max(1024, Math.floor(options.maxBytes)) : 256 * 1024;
    const encoding = options.encoding || 'utf8';
    const logPath = resolveDaemonLogPath();

    try {
      await fs.promises.access(logPath, fs.constants.F_OK | fs.constants.R_OK);
    } catch {
      return { path: logPath, exists: false, lines: [] };
    }

    const lines = await tailFileLines(logPath, { tailLines, maxBytes, encoding });
    return { path: logPath, exists: true, lines };
  }

  return {
    service,
    pid,
    sockPath,
    heartbeat,
    startHeartbeat,
    stopHeartbeat,
    restartSelf,
    restartDocker,
    checkWebPerm,
    readDaemonLog
  };
}

function resolveDefaultSockPath() {
  try {
    const appRoot = paths.getAppRoot();
    return path.join(appRoot, 'daemon.sock');
  } catch {
    return path.join(process.cwd(), 'daemon.sock');
  }
}

function resolveDaemonLogPath() {
  try {
    return paths.getPath('data', 'log', 'daemon.log');
  } catch {
    return path.join(process.cwd(), 'data', 'log', 'daemon.log');
  }
}

async function tailFileLines(filePath, options = {}) {
  const tailLines = options.tailLines;
  const maxBytes = options.maxBytes;
  const encoding = options.encoding || 'utf8';

  const handle = await fs.promises.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const fileSize = Number(stat.size) || 0;
    if (fileSize <= 0) return [];

    const chunkSize = 16 * 1024;
    const buffer = Buffer.alloc(chunkSize);

    let position = fileSize;
    let totalRead = 0;
    let text = '';

    while (position > 0 && totalRead < maxBytes) {
      const readSize = Math.min(chunkSize, position);
      position -= readSize;

      const { bytesRead } = await handle.read(buffer, 0, readSize, position);
      if (!bytesRead) break;
      totalRead += bytesRead;

      const chunkText = buffer.subarray(0, bytesRead).toString(encoding);
      text = chunkText + text;

      const lineCount = countLines(text);
      if (lineCount >= tailLines + 1) break;
    }

    const normalized = text.replace(/\r\n/g, '\n');
    const parts = normalized.split('\n');
    while (parts.length && parts[0] === '') parts.shift();
    while (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts.slice(-tailLines);
  } finally {
    await handle.close().catch(() => {});
  }
}

function countLines(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}

module.exports = { createDaemonClient };

