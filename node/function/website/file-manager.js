const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { getPath } = require('../../config/paths');

// 校验站点域名，仅允许非空且不包含路径分隔符
function validateDomain(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('域名不能为空');
  if (value.length > 255) throw new Error('域名长度不能超过 255 字符');
  if (/[/\\]/.test(value)) throw new Error('域名不能包含路径分隔符');
  return value;
}

// 站点静态文件根目录
function resolveWebsiteDir(domain) {
  const name = validateDomain(domain);
  return getPath('data', 'www', 'openresty', 'website', name);
}

// Nginx 规则文件目录
function resolveWebRulesDir(domain) {
  const name = validateDomain(domain);
  return getPath('data', 'www', 'openresty', 'web-rules', name);
}

function resolveConfFile(domain) {
  const name = validateDomain(domain);
  return getPath('data', 'www', 'openresty', 'conf', name + '.conf');
}

function resolveLogFiles(domain) {
  const name = validateDomain(domain);
  const dir = getPath('data', 'www', 'openresty', 'web_log');
  return {
    access: path.join(dir, name + '.access.log'),
    error: path.join(dir, name + '.error.log')
  };
}

function resolveLogArchiveDir(domain) {
  const name = validateDomain(domain);
  const dir = getPath('data', 'www', 'openresty', 'web_log');
  return path.join(dir, name);
}

async function ensureDir(p, mode) {
  await fsp.mkdir(p, { recursive: true });
  if (mode !== undefined) {
    await fsp.chmod(p, mode);
  }
}

// 为新站点创建目录结构及默认首页
async function createSiteFiles(domain) {
  const name = validateDomain(domain);
  const websiteDir = resolveWebsiteDir(name);
  const rulesDir = resolveWebRulesDir(name);
  await ensureDir(websiteDir, 0o757);
  await ensureDir(rulesDir);
  const indexFile = path.join(websiteDir, 'index.html');
  let exists = false;
  try {
    await fsp.access(indexFile, fs.constants.F_OK);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) {
    const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>站点已创建</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0f172a;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh}main{max-width:640px;padding:32px 24px;text-align:center;background:rgba(15,23,42,.9);border-radius:16px;box-shadow:0 20px 40px rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.4)}h1{font-size:26px;margin:0 0 12px;font-weight:600;color:#f97316}p{margin:6px 0;font-size:14px;line-height:1.6;color:#cbd5f5}code{display:inline-block;margin-top:12px;background:rgba(15,23,42,.9);padding:6px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.5);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;color:#e5e7eb}</style></head><body><main><h1>站点已创建</h1><p>静态站点目录已准备就绪。</p><p>请通过文件管理器上传网站文件，或使用前端管理界面进行部署。</p><code>' + name + '</code></main></body></html>';
    await fsp.writeFile(indexFile, html, 'utf8');
  }
  return { success: true, websiteDir, rulesDir, indexFileCreated: !exists };
}

async function deleteIfExists(targetPath, options = {}) {
  try {
    if (options.recursive) {
      await fsp.rm(targetPath, { recursive: true, force: true });
    } else {
      await fsp.unlink(targetPath);
    }
    return true;
  } catch {
    return false;
  }
}

async function deleteSiteFiles(domain) {
  const name = validateDomain(domain);
  const websiteDir = resolveWebsiteDir(name);
  const rulesDir = resolveWebRulesDir(name);
  const confFile = resolveConfFile(name);
  const logs = resolveLogFiles(name);
  const removed = {};
  removed.websiteDir = await deleteIfExists(websiteDir, { recursive: true });
  removed.rulesDir = await deleteIfExists(rulesDir, { recursive: true });
  removed.confFile = await deleteIfExists(confFile);
  removed.accessLog = await deleteIfExists(logs.access);
  removed.errorLog = await deleteIfExists(logs.error);
  removed.logArchiveDir = await deleteIfExists(resolveLogArchiveDir(name), { recursive: true });
  return { success: true, removed };
}

module.exports = {
  createSiteFiles,
  deleteSiteFiles,
  resolveWebsiteDir,
  resolveWebRulesDir,
  resolveConfFile,
  resolveLogFiles,
  resolveLogArchiveDir
};

