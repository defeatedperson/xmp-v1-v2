const { dockerAdvancedManager, dockerManager } = require('../docker');

function getContainerName() {
  return 'redis';
}

async function getTargetContainer() {
  const name = getContainerName();
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === name);
  if (!target) throw new Error('容器不存在');
  return { name, containerId: target.containerId };
}

function parseRequirepassFromConfig(content) {
  if (typeof content !== 'string') return '';
  const lines = content.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/^requirepass\b/.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const rawValue = parts.slice(1).join(' ');
      const value = rawValue.trim().replace(/^['"]|['"]$/g, '');
      return value;
    }
  }
  return '';
}

async function readConfigPassword() {
  let containerId;
  try {
    const target = await getTargetContainer();
    containerId = target.containerId;
  } catch {
    return { password: '', source: 'none' };
  }
  try {
    const res = await dockerAdvancedManager.executeCommand(
      containerId,
      ['bash', '-lc', 'if [ -f /usr/local/etc/redis/redis.conf ]; then cat /usr/local/etc/redis/redis.conf; fi'],
      { tty: false, quiet: true, level: 'error' }
    );
    if (!res || !res.success) return { password: '', source: 'none' };
    const pwd = parseRequirepassFromConfig(String(res.output || ''));
    if (!pwd) return { password: '', source: 'none' };
    return { password: pwd, source: 'config' };
  } catch {
    return { password: '', source: 'none' };
  }
}

async function pingRedis(password) {
  const { containerId } = await getTargetContainer();
  const cmd = password
    ? ['bash', '-lc', 'REDISCLI_AUTH="$REDIS_AUTH" redis-cli PING']
    : ['bash', '-lc', 'redis-cli PING'];
  const options = password
    ? { tty: false, quiet: true, level: 'error', env: [`REDIS_AUTH=${password}`] }
    : { tty: false, quiet: true, level: 'error' };
  const res = await dockerAdvancedManager.executeCommand(containerId, cmd, options);
  if (!res || !res.success) return { ok: false, message: 'PING失败' };
  const out = String(res.output || '').trim();
  if (/^PONG\b/i.test(out)) return { ok: true };
  return { ok: false, message: out || 'PING失败' };
}

async function getServiceStatus() {
  const name = getContainerName();
  try {
    const list = await dockerManager.listContainers(true);
    const target = list.find(c => c && c.name === name);
    if (!target) return { status: '不存在' };
    const info = await dockerManager.getContainerInfo(target.containerId);
    if (!info || !info.running) return { status: '未启动' };
    const ping = await pingRedis();
    if (!ping.ok) {
      const msg = ping.message || '';
      if (/NOAUTH/i.test(msg)) return { status: '正常', message: msg };
      return { status: '异常', message: msg };
    }
    return { status: '正常' };
  } catch {
    return { status: '不存在' };
  }
}

async function getRedisInfo() {
  const status = await getServiceStatus();
  const name = getContainerName();
  if (status.status !== '正常') {
    return {
      status: status.status,
      message: status.message || '',
      containerName: name,
      password: ''
    };
  }
  const cfg = await readConfigPassword();
  const ping = await pingRedis(cfg.password || '');
  return {
    status: ping.ok ? '正常' : '异常',
    message: ping.ok ? '' : ping.message || '',
    containerName: name,
    password: cfg.password || '',
    passwordSource: cfg.source
  };
}

function assertSafePassword(value) {
  if (typeof value !== 'string' || !value) throw new Error('密码不能为空');
  if (!/^[A-Za-z0-9_!@#$%^&*()\-+=.:,?]{8,128}$/.test(value)) throw new Error('密码格式不合法');
  return value;
}

async function ensureConfigWritable(containerId) {
  const cmd = [
    'bash',
    '-lc',
    'CONF="/usr/local/etc/redis/redis.conf"; DIR=$(dirname "$CONF"); mkdir -p "$DIR"; if [ ! -f "$CONF" ]; then touch "$CONF"; fi; chown redis:redis "$CONF" 2>/dev/null || chmod 666 "$CONF" || true'
  ];
  const res = await dockerAdvancedManager.executeCommand(
    containerId,
    cmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!res || !res.success) throw new Error('配置文件权限修复失败');
}

async function writeConfigRequirepass(containerId, password) {
  const cmd = [
    'bash',
    '-lc',
    'CONF="/usr/local/etc/redis/redis.conf"; DIR=$(dirname "$CONF"); mkdir -p "$DIR"; if [ ! -f "$CONF" ]; then touch "$CONF"; fi; TMP="${CONF}.tmp.$$"; awk -v pwd="$REDIS_NEW_PASSWORD" \'BEGIN{found=0} /^[[:space:]]*requirepass[[:space:]]+/ {print "requirepass " pwd; found=1; next} {print} END{if(!found){print ""; print "requirepass " pwd}}\' "$CONF" > "$TMP"; mv "$TMP" "$CONF"'
  ];
  const res = await dockerAdvancedManager.executeCommand(
    containerId,
    cmd,
    { tty: false, quiet: true, level: 'error', env: [`REDIS_NEW_PASSWORD=${password}`] }
  );
  if (!res || !res.success) throw new Error('持久化配置失败');
}

async function changePassword(newPassword) {
  const next = assertSafePassword(newPassword);
  const { containerId } = await getTargetContainer();
  await ensureConfigWritable(containerId);
  await writeConfigRequirepass(containerId, next);
  try {
    await dockerManager.stopContainer(containerId, 10);
  } catch {}
  await dockerManager.startContainer(containerId);
  const pingNew = await pingRedis(next);
  if (!pingNew.ok) throw new Error('新密码验证失败');
  const cfgAfter = await readConfigPassword();
  if (!cfgAfter || cfgAfter.source !== 'config' || cfgAfter.password !== next) {
    throw new Error('持久化配置失败');
  }
  return { success: true };
}

async function clearCache() {
  const cfg = await readConfigPassword();
  const { containerId } = await getTargetContainer();
  const cmd = cfg.password
    ? 'REDISCLI_AUTH="$REDIS_AUTH" redis-cli FLUSHALL ASYNC'
    : 'redis-cli FLUSHALL ASYNC';
  const options = cfg.password
    ? { tty: false, quiet: true, level: 'error', env: [`REDIS_AUTH=${cfg.password}`] }
    : { tty: false, quiet: true, level: 'error' };
  const res = await dockerAdvancedManager.executeCommand(containerId, ['bash', '-lc', cmd], options);
  if (!res || !res.success) throw new Error('清空缓存失败');
  return { success: true };
}

module.exports = {
  getServiceStatus,
  getRedisInfo,
  changePassword,
  clearCache
};
