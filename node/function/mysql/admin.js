const fs = require('fs');
const path = require('path');
const { dockerAdvancedManager, dockerManager } = require('../docker');
const { taskManager } = require('../basic/task-manager');
const rootAuth = require('./root-auth');
let manager = null;
try { manager = require('./manager'); } catch {}

/**
 * MySQL实例管理工具
 * 提供：修改root密码、获取容器日志、性能设置（默认持久化到 conf）
 * 提示：容器启动/停止与公开访问开关已由 Docker 管理接口提供，此处不再重复实现
 */

function ensureLockDir() {
  const dir = path.join(rootAuth.getStoreDir(), 'locks');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function acquireLock(name, holder, maxAgeMs = 600000) {
  const file = path.join(ensureLockDir(), `${name}.lock`);
  try {
    if (fs.existsSync(file)) {
      let stale = false;
      try {
        const txt = fs.readFileSync(file, 'utf8');
        const obj = JSON.parse(txt);
        const ts = new Date(obj && obj.updatedAt || obj && obj.createdAt || 0).getTime();
        if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) stale = true;
      } catch {
        stale = true;
      }
      if (stale) {
        try { fs.unlinkSync(file); } catch {}
      } else {
        return false;
      }
    }
    const payload = { name, holder: String(holder || ''), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(payload), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function releaseLock(name) {
  const file = path.join(ensureLockDir(), `${name}.lock`);
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

async function precheckEnvironment(name) {
  const secret = process.env.PASSWORD_SECRET;
  if (!secret) throw new Error('缺少环境变量: PASSWORD_SECRET');
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === name);
  if (!target) throw new Error('容器不存在');
  return { containerId: target.containerId };
}

async function getCurrentRootPassword(name) {
  const pwd = await rootAuth.getRootPassword({ validate: true });
  return pwd;
}

async function tryOnlineChangeRootPassword(name, newPassword) {
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === name);
  if (!target) throw new Error('容器不存在');
  const currentPwd = await getCurrentRootPassword(name);
  const np = String(newPassword).replace(/'/g, "''");
  const sql = [`ALTER USER 'root'@'localhost' IDENTIFIED BY '${np}';`, `FLUSH PRIVILEGES;`].join('\n');
  let ok = false;
  let delay = 300;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r1 = await dockerAdvancedManager.executeCommand(target.containerId, ['bash', '-lc', `MYSQL_PWD="${currentPwd}" mysql -uroot <<'SQL'\n${sql}\nSQL`], { tty: false, quiet: true, level: 'error' });
    if (r1 && r1.success) {
      for (let i = 0; i < 5; i++) {
        const r2 = await dockerAdvancedManager.executeCommand(target.containerId, ['bash', '-lc', `MYSQL_PWD="${np}" mysqladmin -uroot ping`], { tty: false, quiet: true, level: 'error' });
        if (r2 && r2.success && /mysqld is alive/i.test(String(r2.output || ''))) { ok = true; break; }
        await new Promise(res => setTimeout(res, 300));
      }
      if (ok) break;
    }
    await new Promise(res => setTimeout(res, delay));
    delay = Math.min(delay * 2, 5000);
  }
  return ok;
}

async function forceChangeRootPassword(name, newPassword) {
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === name);
  if (!target) throw new Error('容器不存在');
  const np = String(newPassword).replace(/'/g, "''");
  const sql = [`ALTER USER 'root'@'localhost' IDENTIFIED BY '${np}';`, `FLUSH PRIVILEGES;`].join('\n');
  await dockerAdvancedManager.executeCommand(target.containerId, ['bash', '-lc', `cat > /tmp/xmp-reset-root.sql <<'SQL'\n${sql}\nSQL`], { tty: false, quiet: true, level: 'error' });
  await dockerAdvancedManager.executeCommand(target.containerId, ['bash', '-lc', `cat > /etc/mysql/conf.d/xmp-init-reset.cnf <<'EOF'\n[mysqld]\ninit-file=/tmp/xmp-reset-root.sql\nEOF\n`], { tty: false, quiet: true, level: 'error' });
  await dockerManager.stopContainer(target.containerId, 10);
  await dockerManager.startContainer(target.containerId);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const r = await dockerAdvancedManager.executeCommand(target.containerId, ['bash', '-lc', `MYSQL_PWD="${np}" mysqladmin -uroot ping`], { tty: false, quiet: true, level: 'error' });
    if (r && r.success && /mysqld is alive/i.test(String(r.output || ''))) { ready = true; break; }
    await new Promise(res => setTimeout(res, 1000));
  }
  await dockerAdvancedManager.executeCommand(target.containerId, ['bash', '-lc', `rm -f /etc/mysql/conf.d/xmp-init-reset.cnf /tmp/xmp-reset-root.sql`], { tty: false, quiet: true, level: 'error' });
  return ready;
}

/** 修改root密码，成功后更新本地加密文件并失效缓存 */
async function changeRootPassword(newPassword) {
  if (!newPassword || typeof newPassword !== 'string') throw new Error('新密码无效');
  const name = 'mysql8';
  await precheckEnvironment(name);
  const locked = acquireLock('root-change', 'sync');
  if (!locked) throw new Error('资源被占用');
  try {
    let ok = false;
    try {
      ok = await tryOnlineChangeRootPassword(name, newPassword);
    } catch {}
    if (!ok) {
      ok = await forceChangeRootPassword(name, newPassword);
    }
    if (!ok) {
      throw new Error('root密码修改失败');
    }
    const saved = rootAuth.saveRootPassword(name, newPassword);
    try { if (manager && typeof manager.resetRootAuthCache === 'function') manager.resetRootAuthCache(); } catch {}
    return { success: true, updatedAt: saved.updatedAt };
  } finally {
    releaseLock('root-change');
  }
}

async function changeRootPasswordAsync(newPassword) {
  if (!newPassword || typeof newPassword !== 'string') throw new Error('新密码无效');
  const name = 'mysql8';
  const taskId = taskManager.createTask('mysql.changeRootPassword', { container: name });
  taskManager.executeTask(taskId, async (_tid, progress, addLog) => {
    progress(1, '校验参数');
    try { await precheckEnvironment(name); } catch (e) { addLog(String(e && e.message || e)); throw e; }
    const locked = acquireLock('root-change', taskId);
    try {
      if (!locked) { addLog('资源被占用'); throw new Error('资源被占用'); }
      addLog('开始修改root密码');
      let ok = false;
      try {
        progress(10, '尝试在线修改');
        ok = await tryOnlineChangeRootPassword(name, newPassword);
        addLog(ok ? '在线修改成功' : '在线修改失败');
      } catch (e) {
        addLog(`在线修改错误: ${String(e && e.message || e)}`);
      }
      if (!ok) {
        progress(40, '执行强制修改');
        try {
          ok = await forceChangeRootPassword(name, newPassword);
          addLog(ok ? '强制修改成功' : '强制修改失败');
        } catch (e) {
          addLog(`强制修改错误: ${String(e && e.message || e)}`);
        }
      }
      if (!ok) {
        progress(90, '修改失败');
        throw new Error('root密码修改失败');
      }
      const saved = rootAuth.saveRootPassword(name, newPassword);
      try { if (manager && typeof manager.resetRootAuthCache === 'function') manager.resetRootAuthCache(); } catch {}
      progress(100, '完成');
    } finally {
      if (locked) releaseLock('root-change');
    }
  });
  return { taskId };
}

/** 获取容器日志（stdout/stderr） */
async function getMysqlLogs(options = {}) {
  const name = 'mysql8';
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === name);
  if (!target) throw new Error('容器不存在');
  const tail = options.tail !== undefined ? options.tail : 500;
  const since = options.since;
  const timestamps = options.timestamps !== undefined ? options.timestamps : true;
  return await dockerAdvancedManager.getContainerLogs(target.containerId, { tail, since, timestamps });
}

/**
 * 运行时性能参数调整（SET GLOBAL），可选持久化到cnf
 */
async function updatePerformanceSettings(settings = {}, persist = true) {
  const allowed = [
    'max_connections',
    'thread_cache_size',
    'wait_timeout',
    'interactive_timeout',
    'innodb_buffer_pool_size',
    'tmp_table_size',
    'max_heap_table_size',
    'table_open_cache',
    'max_allowed_packet',
    'innodb_flush_log_at_trx_commit',
    'sync_binlog',
    'innodb_io_capacity',
    'innodb_io_capacity_max'
  ];
  const entries = Object.entries(settings).filter(([k, v]) => allowed.includes(k) && v !== undefined && v !== null);
  if (!entries.length) return { success: true, updated: [] };
  const updated = [];
  const name = 'mysql8';
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === name);
  if (!target) throw new Error('容器不存在');
  const sqlLines = entries.map(([k, v]) => `SET GLOBAL ${k} = ${Number(v)};`);
  const currentPwd = await getCurrentRootPassword(name);
  await dockerAdvancedManager.executeCommand(target.containerId, ['bash', '-lc', `MYSQL_PWD="${currentPwd}" mysql -uroot <<'SQL'\n${sqlLines.join('\n')}\nSQL`], { tty: false });
  for (const [key] of entries) updated.push(key);
  if (persist) {
    const name = 'mysql8';
    const list = await dockerManager.listContainers(true);
    const target = list.find(c => c && c.name === name);
    if (!target) throw new Error('容器不存在');
    const lines = ['[mysqld]', ...entries.map(([k, v]) => `${k}=${v}`)];
    const cmd = ['bash', '-lc', `cat > /etc/mysql/conf.d/xmp-performance.cnf <<'EOF'\n${lines.join('\n')}\nEOF\n`];
    await dockerAdvancedManager.executeCommand(target.containerId, cmd, { tty: false });
  }
  return { success: true, updated, persist };
}

async function getCurrentPerformanceSettings(keys) {
  const allowed = [
    'max_connections',
    'thread_cache_size',
    'wait_timeout',
    'interactive_timeout',
    'innodb_buffer_pool_size',
    'tmp_table_size',
    'max_heap_table_size',
    'table_open_cache',
    'max_allowed_packet',
    'innodb_flush_log_at_trx_commit',
    'sync_binlog',
    'innodb_io_capacity',
    'innodb_io_capacity_max'
  ];
  const list = Array.isArray(keys) && keys.length ? keys.filter(k => allowed.includes(k)) : allowed;
  const name = 'mysql8';
  const containers = await dockerManager.listContainers(true);
  const target = containers.find(c => c && c.name === name);
  if (!target) throw new Error('容器不存在');
  const currentPwd = await getCurrentRootPassword(name);
  const inList = list.map(k => `'${k}'`).join(',');
  const sql = `SHOW GLOBAL VARIABLES WHERE Variable_name IN (${inList})`;
  const res = await dockerAdvancedManager.executeCommand(target.containerId, ['bash', '-lc', `MYSQL_PWD="${currentPwd}" mysql -uroot -N -s -e "${sql}"`], { tty: false });
  const lines = String(res && res.output || '').trim().split('\n').filter(Boolean);
  const map = {};
  for (const line of lines) {
    const parts = line.split('\t');
    const k = parts[0];
    let v = parts[1];
    if (typeof v === 'string') {
      const n = Number(v);
      v = isNaN(n) ? v : n;
    }
    if (k) map[k] = v;
  }
  return { success: true, data: map };
}

async function getServiceStatus() {
  const name = 'mysql8';
  try {
    const containers = await dockerManager.listContainers(true);
    const target = containers.find(c => c && c.name === name);
    if (!target) return { status: '不存在' };
    const info = await dockerManager.getContainerInfo(target.containerId);
    if (!info || !info.running) return { status: '未启动' };
    return { status: '正常' };
  } catch {
    return { status: '不存在' };
  }
}

module.exports = { changeRootPassword, changeRootPasswordAsync, getMysqlLogs, updatePerformanceSettings, getCurrentPerformanceSettings, getServiceStatus };

