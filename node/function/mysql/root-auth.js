const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPath } = require('../../config/paths');
const { dockerAdvancedManager, dockerManager } = require('../docker');

let cachedSecretKey = null;
let cachedRootPwd = null;

function ensureStoreDir() {
  const dir = getPath('data', 'mysql');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getStoreDir() {
  return ensureStoreDir();
}

function rootStoreFile() {
  return path.join(ensureStoreDir(), 'root.json');
}

function readRootStore() {
  const file = rootStoreFile();
  if (!fs.existsSync(file)) return null;
  const txt = fs.readFileSync(file, 'utf8');
  if (!txt.trim()) return null;
  try {
    const data = JSON.parse(txt);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function writeRootStore(entry) {
  const file = rootStoreFile();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2));
  fs.renameSync(tmp, file);
}

function getSecretKey() {
  if (cachedSecretKey) return cachedSecretKey;
  const secret = process.env.PASSWORD_SECRET;
  if (!secret) throw new Error('缺少环境变量: PASSWORD_SECRET');
  cachedSecretKey = crypto.createHash('sha256').update(String(secret)).digest();
  return cachedSecretKey;
}

function encryptPassword(plain, aad) {
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString('hex'), ct: ct.toString('hex'), tag: tag.toString('hex') };
}

function decryptPassword(enc, aad) {
  const key = getSecretKey();
  const iv = Buffer.from(enc.iv, 'hex');
  const ct = Buffer.from(enc.ct, 'hex');
  const tag = Buffer.from(enc.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

async function getTargetContainer() {
  const name = 'mysql8';
  const list = await dockerManager.listContainers(true);
  const target = list.find(c => c && c.name === name);
  if (!target) throw new Error('容器不存在');
  return { name, containerId: target.containerId };
}

async function pingRoot(containerId, password) {
  const cmd = ['bash', '-lc', `MYSQL_PWD="${password}" mysqladmin -uroot ping`];
  const res = await dockerAdvancedManager.executeCommand(containerId, cmd, { tty: false, quiet: true, level: 'error' });
  if (!res || !res.success) {
    const out = String(res && (res.errorOutput || res.output) || '').trim();
    const msg = out || 'root连接MySQL失败';
    return { ok: false, message: msg };
  }
  const out = String(res.output || '').trim();
  if (!/mysqld is alive/i.test(out)) {
    return { ok: false, message: 'root连接MySQL失败' };
  }
  return { ok: true };
}

async function getRootPassword(options = {}) {
  const validate = options && options.validate === true;
  if (!validate && cachedRootPwd) return cachedRootPwd;
  const name = 'mysql8';
  const aad = `root|${name}`;
  const meta = readRootStore();
  const candidates = [];
  if (meta && meta.passwordEnc) {
    try {
      const pwd = decryptPassword(meta.passwordEnc, aad);
      if (pwd) candidates.push({ source: 'store', password: String(pwd) });
    } catch {}
  }
  if (process.env.MYSQL_ROOT_PASSWORD) {
    const pwd = String(process.env.MYSQL_ROOT_PASSWORD).trim();
    if (pwd) candidates.push({ source: 'env', password: pwd });
  }
  let containerId = null;
  try {
    const container = await getTargetContainer();
    containerId = container.containerId;
    try {
      const r = await dockerAdvancedManager.executeCommand(containerId, ['bash', '-lc', 'printenv MYSQL_ROOT_PASSWORD'], { tty: false, quiet: true, level: 'error' });
      if (r && r.success) {
        const pwd = String(r.output || '').trim();
        if (pwd) candidates.push({ source: 'containerEnv', password: pwd });
      }
    } catch {}
  } catch (e) {
    if (validate) throw e;
  }
  if (!validate) {
    const c = candidates.find(x => x && x.password);
    if (!c) throw new Error('无法获取MYSQL_ROOT_PASSWORD');
    if (c.source !== 'store') {
      const now = new Date().toISOString();
      const enc = encryptPassword(c.password, aad);
      const entry = { v: 1, containerName: name, host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), passwordEnc: enc, createdAt: now, updatedAt: now };
      writeRootStore(entry);
    }
    cachedRootPwd = c.password;
    return cachedRootPwd;
  }
  if (!containerId) throw new Error('容器不存在');
  const errors = [];
  for (const c of candidates) {
    if (!c || !c.password) continue;
    const r = await pingRoot(containerId, c.password);
    if (r.ok) {
      if (c.source !== 'store') {
        const now = new Date().toISOString();
        const enc = encryptPassword(c.password, aad);
        const entry = { v: 1, containerName: name, host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), passwordEnc: enc, createdAt: now, updatedAt: now };
        writeRootStore(entry);
      }
      cachedRootPwd = c.password;
      return cachedRootPwd;
    }
    if (r.message) errors.push(r.message);
  }
  if (!candidates.length) throw new Error('无法获取MYSQL_ROOT_PASSWORD');
  const msg = errors[0] || 'root连接MySQL失败';
  throw new Error(msg);
}

function saveRootPassword(name, password) {
  const now = new Date().toISOString();
  const aad = `root|${name}`;
  const enc = encryptPassword(password, aad);
  const entry = { v: 1, containerName: name, host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), passwordEnc: enc, createdAt: now, updatedAt: now };
  writeRootStore(entry);
  cachedRootPwd = password;
  return { entry, updatedAt: now };
}

function resetRootAuthCache() {
  cachedRootPwd = null;
}

module.exports = {
  getStoreDir,
  readRootStore,
  writeRootStore,
  encryptPassword,
  decryptPassword,
  getRootPassword,
  getTargetContainer,
  saveRootPassword,
  resetRootAuthCache
};

