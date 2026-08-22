const { dockerManager, dockerAdvancedManager } = require('../docker');

const BASE_FPM_CONFIG_PATH = '/usr/local/etc/php-fpm.d/www.conf';
const CUSTOM_FPM_CONFIG_PATH = '/www/conf/fpm.d/xmp-fpm.conf';

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
    'pm',
    'pm.max_children',
    'pm.start_servers',
    'pm.min_spare_servers',
    'pm.max_spare_servers',
    'pm.max_requests'
  ];
  if (Array.isArray(requestedKeys) && requestedKeys.length) {
    return requestedKeys.filter(k => allowed.includes(k));
  }
  return allowed;
}

function parseFpmConfig(content, keys) {
  const result = {};
  if (!content) return result;
  const lines = String(content).split('\n');
  const keySet = new Set(keys);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!keySet.has(key)) continue;
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

async function getFpmSettings(containerNameInput, keys) {
  const { name, containerId } = await getTargetContainer(containerNameInput);
  const list = getAllowedKeys(keys);
  if (!list.length) {
    return { success: true, containerName: name, data: {}, isDefault: true };
  }
  const baseCmd = [
  'sh',
  '-c',
    'if [ -f "' + BASE_FPM_CONFIG_PATH + '" ]; then cat "' + BASE_FPM_CONFIG_PATH + '"; fi'
  ];
  const baseRes = await dockerAdvancedManager.executeCommand(
    containerId,
    baseCmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!baseRes || !baseRes.success) {
    throw new Error('获取PHP-FPM配置失败');
  }
  const baseText = String(baseRes.output || '');
  const baseData = parseFpmConfig(baseText, list);
  const customCmd = [
    'sh',
    '-c',
    'CONF="' + CUSTOM_FPM_CONFIG_PATH + '"; if [ -f "$CONF" ]; then cat "$CONF"; fi'
  ];
  const customRes = await dockerAdvancedManager.executeCommand(
    containerId,
    customCmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!customRes || !customRes.success) {
    throw new Error('获取PHP-FPM配置失败');
  }
  const customText = String(customRes.output || '');
  const customData = parseFpmConfig(customText, list);
  const data = { ...baseData };
  for (const [k, v] of Object.entries(customData)) {
    data[k] = v;
  }
  const isDefault = customText.trim().length === 0;
  return {
    success: true,
    containerName: name,
    data,
    isDefault
  };
}

function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') {
    return value ? 'dynamic' : '';
  }
  const s = String(value).trim();
  return s;
}

function applyFpmSettingsToContent(content, updates) {
  const lines = String(content).split('\n');
  const keys = Object.keys(updates);
  const used = {};
  for (const k of keys) used[k] = false;
  const updatedLines = lines.map(rawLine => {
    const line = rawLine;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('[')) {
      return line;
    }
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return line;
    const key = trimmed.slice(0, idx).trim();
    if (!Object.prototype.hasOwnProperty.call(updates, key)) {
      return line;
    }
    const value = updates[key];
    used[key] = true;
    const prefix = line.slice(0, line.indexOf('='));
    return prefix + '= ' + value;
  });
  const appendLines = [];
  for (const key of keys) {
    if (used[key]) continue;
    const value = updates[key];
    appendLines.push(key + ' = ' + value);
  }
  if (appendLines.length) {
    if (updatedLines.length && updatedLines[updatedLines.length - 1].trim() !== '') {
      updatedLines.push('');
    }
    for (const l of appendLines) updatedLines.push(l);
  }
  return updatedLines.join('\n');
}

async function updateFpmSettings(containerNameInput, settings = {}) {
  const { name, containerId } = await getTargetContainer(containerNameInput);
  if (!settings || typeof settings !== 'object') {
    throw new Error('无效的配置参数');
  }
  const allowedKeys = getAllowedKeys();
  const entries = Object.entries(settings).filter(([k, v]) => allowedKeys.includes(k) && v !== undefined && v !== null);
  if (!entries.length) {
    return { success: true, containerName: name, updatedKeys: [], restarted: false };
  }
  const updates = {};
  for (const [key, rawValue] of entries) {
    const value = normalizeValue(rawValue);
    if (!value && value !== '0') continue;
    updates[key] = value;
  }
  if (!Object.keys(updates).length) {
    return { success: true, containerName: name, updatedKeys: [], restarted: false };
  }
  const readCmd = [
    'sh',
    '-c',
    'CONF="' + CUSTOM_FPM_CONFIG_PATH + '"; if [ -f "$CONF" ]; then cat "$CONF"; fi'
  ];
  const readRes = await dockerAdvancedManager.executeCommand(
    containerId,
    readCmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!readRes || !readRes.success) {
    throw new Error('读取PHP-FPM配置失败');
  }
  const currentText = String(readRes.output || '');
  const nextText = applyFpmSettingsToContent(currentText, updates);
  const writeCmd = [
    'sh',
    '-c',
    'CONF="' + CUSTOM_FPM_CONFIG_PATH + '"; DIR=$(dirname "$CONF"); mkdir -p "$DIR"; cat > "$CONF" <<\'EOF\'\n' + nextText + '\nEOF\n'
  ];
  const writeRes = await dockerAdvancedManager.executeCommand(
    containerId,
    writeCmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!writeRes || !writeRes.success) {
    throw new Error('写入PHP-FPM配置失败');
  }
  await dockerManager.stopContainer(containerId, 10);
  await dockerManager.startContainer(containerId);
  return {
    success: true,
    containerName: name,
    updatedKeys: Object.keys(updates),
    restarted: true
  };
}

module.exports = {
  getFpmSettings,
  updateFpmSettings
};
