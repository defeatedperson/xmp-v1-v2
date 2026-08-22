const { dockerManager, dockerAdvancedManager } = require('../docker');

const EXT_CONFIG_PATH = '/www/conf/php.d/xmp-extensions.ini';

function validateContainerName(name) {
  const n = String(name || '').trim();
  if (!/^php\d{2}$/.test(n)) {
    throw new Error('容器名必须是php+2位数字');
  }
  return n;
}

function validateMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m !== 'core' && m !== 'pecl') {
    throw new Error('模式必须是core或pecl');
  }
  return m;
}

function validateExtensionName(ext) {
  const e = String(ext || '').trim();
  if (!/^[A-Za-z0-9_]{1,64}$/.test(e)) {
    throw new Error('扩展名称格式无效');
  }
  return e;
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

async function getActiveExtensions(containerName) {
  const { name, containerId } = await getTargetContainer(containerName);
  const res = await dockerAdvancedManager.executeCommand(
    containerId,
    ['php', '-m'],
    { tty: false, quiet: true, level: 'error' }
  );
  if (!res || !res.success) {
    throw new Error('获取扩展列表失败');
  }
  const text = String(res.output || '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const modules = [];
  const zendModules = [];
  let section = '';
  for (const line of lines) {
    if (line === 'PHP Modules') {
      section = 'php';
      continue;
    }
    if (line === 'Zend Modules') {
      section = 'zend';
      continue;
    }
    if (/^=+$/.test(line)) {
      continue;
    }
    if (section === 'zend') {
      zendModules.push(line);
    } else {
      modules.push(line);
    }
  }
  return {
    success: true,
    containerName: name,
    modules,
    zendModules,
    raw: text
  };
}

function installExtensionAsync(containerNameInput, extensionInput, modeInput) {
  const containerName = validateContainerName(containerNameInput);
  const extension = validateExtensionName(extensionInput);
  const mode = validateMode(modeInput);
  return dockerManager.listContainers(true).then(async list => {
    const target = list.find(c => c && c.name === containerName);
    if (!target) {
      throw new Error('容器不存在');
    }
    const containerId = target.containerId;
    const extKey = extension.toLowerCase();
    const writeCmd = [
      'sh',
      '-c',
      `CONF="${EXT_CONFIG_PATH}"; DIR=$(dirname "$CONF"); mkdir -p "$DIR"; if [ -f "$CONF" ] && grep -q "^extension=${extKey}$" "$CONF"; then exit 0; fi; echo "extension=${extKey}" >> "$CONF"`
    ];
    const writeRes = await dockerAdvancedManager.executeCommand(
      containerId,
      writeCmd,
      { tty: false, quiet: true, level: 'error' }
    );
    if (!writeRes || !writeRes.success) {
      throw new Error('写入扩展配置失败');
    }
    await dockerManager.stopContainer(containerId, 10);
    await dockerManager.startContainer(containerId);
    return { success: true, containerName, extension, mode, restarted: true };
  });
}

function disableExtensionAsync(containerNameInput, extensionInput, modeInput) {
  const containerName = validateContainerName(containerNameInput);
  const extension = validateExtensionName(extensionInput);
  const mode = validateMode(modeInput);
  return dockerManager.listContainers(true).then(async list => {
    const target = list.find(c => c && c.name === containerName);
    if (!target) {
      throw new Error('容器不存在');
    }
    const containerId = target.containerId;
    const extKey = extension.toLowerCase();
    const checkCmd = [
      'sh',
      '-c',
      `CONF="${EXT_CONFIG_PATH}"; if [ -f "$CONF" ] && grep -q "^extension=${extKey}$" "$CONF"; then echo "FOUND"; fi`
    ];
    const checkRes = await dockerAdvancedManager.executeCommand(
      containerId,
      checkCmd,
      { tty: false, quiet: true, level: 'error' }
    );
    const present = checkRes && typeof checkRes.output === 'string' && checkRes.output.includes('FOUND');
    if (!present) {
      throw new Error('此扩展是核心自带扩展，无法禁用');
    }
    const cmd = [
      'sh',
      '-c',
      `CONF="${EXT_CONFIG_PATH}"; if [ -f "$CONF" ]; then TMP=$(mktemp); grep -v "^extension=${extKey}$" "$CONF" > "$TMP"; mv "$TMP" "$CONF"; fi`
    ];
    const res = await dockerAdvancedManager.executeCommand(
      containerId,
      cmd,
      { tty: false, quiet: true, level: 'error' }
    );
    if (!res || !res.success) {
      throw new Error('禁用扩展失败');
    }
    await dockerManager.stopContainer(containerId, 10);
    await dockerManager.startContainer(containerId);
    return { success: true, containerName, extension, mode, restarted: true };
  });
}

module.exports = {
  getActiveExtensions,
  installExtensionAsync,
  disableExtensionAsync
};

