const { dockerManager, dockerAdvancedManager } = require('../docker');

const SETTINGS_CONFIG_PATH = '/www/conf/php.d/xmp-settings.ini';

function validateContainerName(name) {
  const n = String(name || '').trim();
  if (!/^php\d{2}$/.test(n)) {
    throw new Error('容器名必须是php+2位数字');
  }
  return n;
}

async function getTargetContainer(containerNameInput) {
  const name = validateContainerName(containerNameInput);
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === name);
  if (!target) {
    throw new Error('容器不存在');
  }
  return { name, containerId: target.containerId };
}

function getAllowedKeys(requestedKeys) {
  const allowed = [
    'short_open_tag',
    'default_socket_timeout',
    'max_execution_time',
    'max_input_time',
    'post_max_size',
    'file_uploads',
    'upload_max_filesize',
    'max_file_uploads',
    'memory_limit',
    'display_errors',
    'error_reporting',
    'disable_functions',
    'disable_classes'
  ];
  if (Array.isArray(requestedKeys) && requestedKeys.length) {
    return requestedKeys.filter(k => allowed.includes(k));
  }
  return allowed;
}

async function getPhpSettings(containerNameInput, keys) {
  const { name, containerId } = await getTargetContainer(containerNameInput);
  const list = getAllowedKeys(keys);
  if (!list.length) {
    return { success: true, containerName: name, data: {}, isDefault: true };
  }
  const cmd = [
    'sh',
    '-c',
    'CONF="' + SETTINGS_CONFIG_PATH + '"; if [ -f "$CONF" ]; then cat "$CONF"; fi'
  ];
  const res = await dockerAdvancedManager.executeCommand(
    containerId,
    cmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!res || !res.success) {
    throw new Error('获取PHP配置失败');
  }
  const text = String(res.output || '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const data = {};
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!list.includes(key)) continue;
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  }
  let isDefault = true;
  try {
    const checkCmd = [
      'sh',
      '-c',
      'CONF="' + SETTINGS_CONFIG_PATH + '"; if [ -s "$CONF" ]; then echo "HAS"; fi'
    ];
    const checkRes = await dockerAdvancedManager.executeCommand(
      containerId,
      checkCmd,
      { tty: false, quiet: true, level: 'error' }
    );
    if (checkRes && typeof checkRes.output === 'string' && checkRes.output.includes('HAS')) {
      isDefault = false;
    }
  } catch {
    isDefault = true;
  }
  return {
    success: true,
    containerName: name,
    data,
    isDefault
  };
}

function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const list = value.map(v => String(v || '').trim()).filter(Boolean);
    return list.length ? list.join(',') : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'On' : 'Off';
  }
  const s = String(value).trim();
  return s;
}

async function updatePhpSettings(containerNameInput, settings = {}) {
  const { name, containerId } = await getTargetContainer(containerNameInput);
  if (!settings || typeof settings !== 'object') {
    throw new Error('无效的配置参数');
  }
  const allowedKeys = getAllowedKeys();
  const entries = Object.entries(settings).filter(([k, v]) => allowedKeys.includes(k) && v !== undefined && v !== null);
  const lines = [];
  for (const [key, rawValue] of entries) {
    const value = normalizeValue(rawValue);
    if (!value && value !== '0') continue;
    lines.push(key + '=' + value);
  }
  const content = lines.join('\n');
  const cmd = [
    'sh',
    '-c',
    'CONF="' + SETTINGS_CONFIG_PATH + '"; DIR=$(dirname "$CONF"); mkdir -p "$DIR"; cat > "$CONF" <<\'EOF\'\n' + content + '\nEOF\n'
  ];
  const writeRes = await dockerAdvancedManager.executeCommand(
    containerId,
    cmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!writeRes || !writeRes.success) {
    throw new Error('写入PHP配置失败');
  }
  await dockerManager.stopContainer(containerId, 10);
  await dockerManager.startContainer(containerId);
  return {
    success: true,
    containerName: name,
    updatedKeys: lines.map(line => line.split('=')[0]),
    restarted: true
  };
}

module.exports = {
  getPhpSettings,
  updatePhpSettings
};

