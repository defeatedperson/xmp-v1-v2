const { dockerManager, dockerAdvancedManager } = require('../docker');

const SO_EXT_CONFIG_PATH = '/www/conf/php.d/xmp-so-extensions.ini';

function validateContainerName(name) {
  const n = String(name || '').trim();
  if (!/^php\d{2}$/.test(n)) {
    throw new Error('容器名必须是php+2位数字');
  }
  return n;
}

function validateSoFilename(filename) {
  const f = String(filename || '').trim();
  if (!f) {
    throw new Error('扩展文件名不能为空');
  }
  if (!/^[A-Za-z0-9_.-]{1,128}\.so$/.test(f)) {
    throw new Error('扩展文件名格式无效，必须是类似redis.so的文件名');
  }
  return f;
}

function validateAction(action) {
  const a = String(action || '').trim().toLowerCase();
  if (a === 'add' || a === 'enable' || a === 'install' || a === '添加') {
    return 'add';
  }
  if (a === 'remove' || a === 'delete' || a === 'uninstall' || a === 'disable' || a === '移除' || a === '删除') {
    return 'remove';
  }
  throw new Error('操作方式必须是添加或移除');
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

async function ensureSoFileExists(containerId, filename) {
  const cmd = [
    'sh',
    '-c',
    `EXT="${filename}"; if [ -f "/www/ext/$EXT" ]; then echo "FOUND"; fi`
  ];
  const res = await dockerAdvancedManager.executeCommand(
    containerId,
    cmd,
    { tty: false, quiet: true, level: 'error' }
  );
  const ok = res && typeof res.output === 'string' && res.output.includes('FOUND');
  if (!ok) {
    throw new Error('扩展文件不存在，请先将.so文件放入ext目录');
  }
}

async function writeConfigLine(containerId, filename) {
  const line = `extension=/www/ext/${filename}`;
  const cmd = [
    'sh',
    '-c',
    `CONF="${SO_EXT_CONFIG_PATH}"; DIR=$(dirname "$CONF"); mkdir -p "$DIR"; LINE="${line}"; if [ -f "$CONF" ] && grep -q "^$LINE$" "$CONF"; then exit 0; fi; echo "$LINE" >> "$CONF"`
  ];
  const res = await dockerAdvancedManager.executeCommand(
    containerId,
    cmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!res || !res.success) {
    throw new Error('写入扩展配置失败');
  }
}

async function removeConfigLine(containerId, filename) {
  const line = `extension=/www/ext/${filename}`;
  const checkCmd = [
    'sh',
    '-c',
    `CONF="${SO_EXT_CONFIG_PATH}"; LINE="${line}"; if [ -f "$CONF" ] && grep -q "^$LINE$" "$CONF"; then echo "FOUND"; fi`
  ];
  const checkRes = await dockerAdvancedManager.executeCommand(
    containerId,
    checkCmd,
    { tty: false, quiet: true, level: 'error' }
  );
  const present = checkRes && typeof checkRes.output === 'string' && checkRes.output.includes('FOUND');
  if (!present) {
    throw new Error('扩展尚未添加，无需移除');
  }
  const cmd = [
    'sh',
    '-c',
    `CONF="${SO_EXT_CONFIG_PATH}"; LINE="${line}"; if [ -f "$CONF" ]; then TMP=$(mktemp); grep -v "^$LINE$" "$CONF" > "$TMP"; mv "$TMP" "$CONF"; fi`
  ];
  const res = await dockerAdvancedManager.executeCommand(
    containerId,
    cmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!res || !res.success) {
    throw new Error('移除扩展配置失败');
  }
}

async function restartPhpContainer(containerId) {
  await dockerManager.stopContainer(containerId, 10);
  await dockerManager.startContainer(containerId);
}

async function getSoExtensions(containerNameInput) {
  const { name, containerId } = await getTargetContainer(containerNameInput);
  const cmd = [
    'sh',
    '-c',
    `CONF="${SO_EXT_CONFIG_PATH}"; if [ -f "$CONF" ]; then cat "$CONF"; fi`
  ];
  const res = await dockerAdvancedManager.executeCommand(
    containerId,
    cmd,
    { tty: false, quiet: true, level: 'error' }
  );
  if (!res || !res.success) {
    throw new Error('获取扩展配置失败');
  }
  const text = String(res.output || '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const extensions = [];
  for (const line of lines) {
    const m = /^extension\s*=\s*(.+)$/.exec(line);
    if (!m) {
      continue;
    }
    const value = m[1].trim();
    const parts = value.split('/');
    const filename = parts[parts.length - 1] || '';
    if (filename && filename.endsWith('.so')) {
      extensions.push(filename);
    }
  }
  return {
    success: true,
    containerName: name,
    extensions,
    raw: text
  };
}

async function operateSoExtensionAsync(containerNameInput, filenameInput, actionInput) {
  const { name, containerId } = await getTargetContainer(containerNameInput);
  const filename = validateSoFilename(filenameInput);
  const action = validateAction(actionInput);
  if (action === 'add') {
    await ensureSoFileExists(containerId, filename);
    await writeConfigLine(containerId, filename);
  } else if (action === 'remove') {
    await removeConfigLine(containerId, filename);
  }
  await restartPhpContainer(containerId);
  return {
    success: true,
    containerName: name,
    filename,
    action,
    restarted: true
  };
}

module.exports = {
  getSoExtensions,
  operateSoExtensionAsync
};

