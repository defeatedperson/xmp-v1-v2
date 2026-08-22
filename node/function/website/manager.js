const fs = require('fs');
const path = require('path');
const { getPath } = require('../../config/paths');
const { isValidDomainName } = require('../basic/domain');
const { applySiteConfigFromJson } = require('./generator');
const { createSiteFiles, deleteSiteFiles } = require('./file-manager');

// 规范化并校验主域名，仅允许非空且不包含路径分隔符
function validatePrimaryDomain(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('primaryDomain 不能为空');
  if (value.length > 255) throw new Error('primaryDomain 长度不能超过 255 字符');
  if (/[/\\]/.test(value)) throw new Error('primaryDomain 不能包含路径分隔符');
  if (!isValidDomainName(value)) throw new Error('primaryDomain 格式无效');
  return value;
}

// 用于比较用的主域名 key，统一为小写
function primaryDomainKey(raw) {
  return String(raw || '').trim().toLowerCase();
}

function ensureConfDir() {
  const dir = getPath('data', 'www', 'openresty', 'conf');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storeFile() {
  return path.join(ensureConfDir(), 'sites.json');
}

function readStore() {
  const file = storeFile();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '[]');
    return [];
  }
  const txt = fs.readFileSync(file, 'utf8');
  if (!txt.trim()) return [];
  try {
    const data = JSON.parse(txt);
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
}

function writeStore(entries) {
  const file = storeFile();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, file);
}

function listSites() {
  return readStore();
}

function parseSiteMetaFromConf(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).slice(0, 20);
  for (const line of lines) {
    const hashIndex = line.indexOf('#');
    if (hashIndex === -1) continue;
    const text = line.slice(hashIndex + 1).trim();
    const prefix = 'site-meta:';
    if (!text.toLowerCase().startsWith(prefix)) continue;
    const jsonText = text.slice(prefix.length).trim();
    if (!jsonText) continue;
    try {
      const meta = JSON.parse(jsonText);
      if (meta && typeof meta === 'object') return meta;
    } catch {}
  }
  return null;
}

function refreshFromConfigs() {
  const dir = ensureConfDir();
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const confFiles = entries.filter(d => d.isFile() && d.name.toLowerCase().endsWith('.conf')).map(d => d.name);
  const prev = readStore();
  const byDomain = new Map();
  for (const item of prev) {
    if (!item) continue;
    const primary = String(item.primaryDomain || '').trim();
    if (!primary) continue;
    const key = primaryDomainKey(primary);
    if (!key) continue;
    if (!byDomain.has(key)) byDomain.set(key, item);
  }
  const next = [];
  const added = [];
  const kept = [];
  const removed = [];
  const invalid = [];
  const prevKeys = new Set(Array.from(byDomain.keys()));
  for (const fname of confFiles) {
    const fullPath = path.join(dir, fname);
    let meta = null;
    try {
      meta = parseSiteMetaFromConf(fullPath);
    } catch {
      meta = null;
    }
    const baseName = fname.replace(/\.conf$/i, '');
    let primaryDomain = '';
    try {
      primaryDomain = meta && meta.primaryDomain ? validatePrimaryDomain(meta.primaryDomain) : validatePrimaryDomain(baseName);
    } catch (e) {
      invalid.push({ confFile: fname, error: String((e && e.message) || 'invalid domain') });
      continue;
    }
    const key = primaryDomainKey(primaryDomain);
    const existing = byDomain.get(key);
    const now = new Date().toISOString();
    if (existing) {
      prevKeys.delete(key);
    }
    let item = existing ? { ...existing } : {};
    const name = meta && meta.name ? String(meta.name) : (item.name || primaryDomain);
    const type = meta && meta.type ? String(meta.type) : (item.type || 'static');
    const root = meta && meta.root ? String(meta.root) : (item.root || ('website/' + primaryDomain));
    const protocol = meta && meta.protocol ? String(meta.protocol) : (item.protocol || 'http');
    const remark = meta && meta.remark ? String(meta.remark) : (item.remark || '');
    const id = primaryDomain;
    item = { ...item, id, primaryDomain, name, type, root, protocol, remark, confFile: fname };
    if (!item.createdAt) item.createdAt = now;
    item.updatedAt = now;
    next.push(item);
    if (existing) kept.push(primaryDomain);
    else added.push(primaryDomain);
  }
  for (const key of prevKeys) {
    const lost = byDomain.get(key);
    if (lost && lost.primaryDomain) removed.push(lost.primaryDomain);
  }
  writeStore(next);
  return { success: true, total: next.length, added, kept, removed, invalid };
}

// 使用完整站点 JSON 创建站点（写入配置文件、创建目录并记录到 sites.json）
async function createSite(siteConfig) {
  const raw = siteConfig || {};
  const primaryDomain = validatePrimaryDomain(raw.primaryDomain);
  const type = String(raw.type || 'static').trim() || 'static';
  const list = readStore();
  const exists = list.find(x => x && primaryDomainKey(x.primaryDomain) === primaryDomainKey(primaryDomain));
  if (exists) throw new Error('主域名已存在');
  const now = new Date().toISOString();
  const normalized = {
    ...raw,
    id: primaryDomain,
    primaryDomain,
    type,
    enabled: raw.enabled === false ? false : true
  };
  const filesInfo = await createSiteFiles(primaryDomain);
  const confResult = applySiteConfigFromJson(normalized);
  const enabled = normalized.enabled !== false;
  const protocol = normalized.httpsEnabled ? 'https' : 'http';
  const directory = 'website/' + primaryDomain;
  const item = {
    id: primaryDomain,
    primaryDomain,
    name: normalized.name || primaryDomain,
    type,
    directory,
    protocol,
    remark: String(normalized.remark || ''),
    confFile: confResult.confFile,
    enabled,
    status: enabled,
    createdAt: now,
    updatedAt: now,
    config: normalized
  };
  list.push(item);
  writeStore(list);
  return { site: item, conf: confResult, files: filesInfo };
}

// 删除站点：仅通过 primaryDomain 定位记录，清理目录/日志/配置文件并从 sites.json 中移除记录
async function deleteSite(identifier) {
  const primaryDomain = validatePrimaryDomain(identifier);
  const list = readStore();
  const next = [];
  let removed = null;
  for (const item of list) {
    if (!item) continue;
    const itemPrimaryDomain = String(item.primaryDomain || '').trim();
    if (!removed && primaryDomainKey(itemPrimaryDomain) === primaryDomainKey(primaryDomain)) {
      removed = item;
      continue;
    }
    next.push(item);
  }
  const domainForFiles = removed && removed.primaryDomain ? removed.primaryDomain : primaryDomain;
  const files = await deleteSiteFiles(domainForFiles);
  if (!removed) {
    return { success: false, message: '记录不存在', files };
  }
  writeStore(next);
  return { success: true, site: removed, files };
}

// 修改站点：在保留 id/primaryDomain 不变的前提下更新配置并重写 conf
async function updateSite(siteConfig) {
  const changes = siteConfig || {};
  const { name: _ignoredName, ...safeChanges } = changes;
  const primaryDomainInput = safeChanges.primaryDomain;
  const primaryDomain = validatePrimaryDomain(primaryDomainInput);
  const list = readStore();
  const index = list.findIndex(item => {
    if (!item) return false;
    const itemPrimaryDomain = String(item.primaryDomain || '').trim();
    return primaryDomainKey(itemPrimaryDomain) === primaryDomainKey(primaryDomain);
  });
  if (index === -1) throw new Error('记录不存在');
  const existing = list[index];
  const baseConfig = existing.config && typeof existing.config === 'object' ? existing.config : {};
  const oldPrimaryDomain = String(existing.primaryDomain || '').trim();
  if (!oldPrimaryDomain) throw new Error('记录数据不完整：缺少 primaryDomain');
  if (primaryDomainKey(primaryDomain) !== primaryDomainKey(oldPrimaryDomain)) {
    throw new Error('暂不支持修改主域名');
  }
  const type = String(safeChanges.type || baseConfig.type || existing.type || 'static').trim() || 'static';
  const normalized = {
    ...baseConfig,
    ...safeChanges,
    id: oldPrimaryDomain,
    primaryDomain: oldPrimaryDomain,
    type
  };
  if (!Object.prototype.hasOwnProperty.call(normalized, 'enabled')) {
    normalized.enabled = baseConfig.enabled === false ? false : true;
  }
  const confResult = applySiteConfigFromJson(normalized);
  const enabled = normalized.enabled !== false;
  const protocol = normalized.httpsEnabled ? 'https' : 'http';
  const directory = existing.directory || ('website/' + oldPrimaryDomain);
  const now = new Date().toISOString();
  const updated = {
    ...existing,
    id: oldPrimaryDomain,
    primaryDomain: oldPrimaryDomain,
    name: existing.name || oldPrimaryDomain,
    type,
    directory,
    protocol,
    remark: String(normalized.remark || existing.remark || ''),
    confFile: confResult.confFile || existing.confFile,
    enabled,
    status: enabled,
    updatedAt: now,
    config: normalized
  };
  list[index] = updated;
  writeStore(list);
  return { site: updated, conf: confResult };
}

module.exports = {
  listSites,
  refreshFromConfigs,
  createSite,
  deleteSite,
  updateSite
};

