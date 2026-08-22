const fs = require('fs');
const path = require('path');
const { getPath } = require('../../config/paths');
const { dockerAdvancedManager } = require('../docker');
const { getOpenrestyContainer } = require('./openresty');
const { runForceDelete } = require('../docker/core/force-deleter');
const { taskManager } = require('../basic/task-manager');
const { dockerManager } = require('../docker');

/**
 * 首次申请证书
 * 通过 Docker 调用容器内的 issue_initial.sh 完成签发
 */
async function issueInitialCert(options = {}) {
  const certName = String(options.certName || '').trim();
  const email = String(options.email || '').trim();
  const remark = String(options.remark || '').trim();
  const domainsInput = options.domains;
  let domains = [];
  if (Array.isArray(domainsInput)) {
    domains = domainsInput.map(v => String(v || '').trim()).filter(Boolean);
  } else if (domainsInput !== undefined && domainsInput !== null) {
    const s = String(domainsInput || '');
    for (const part of s.split(',')) {
      const t = part.trim();
      if (t) domains.push(t);
    }
  }
  if (!certName) throw new Error('证书名不能为空');
  if (!/^[a-zA-Z0-9_-]+$/.test(certName)) throw new Error('证书名包含非法字符');
  if (!email) throw new Error('邮箱不能为空');
  if (!domains.length) throw new Error('域名列表不能为空');
  const autoRenewInput = options.autoRenew;
  const autoRenew = autoRenewInput === undefined || autoRenewInput === null ? true : !!autoRenewInput;
  const autoRenewStr = autoRenew ? 'true' : 'false';
  const domainsCsv = domains.join(',');
  const target = await getOpenrestyContainer();
  const cmd = ['/www/scripts/issue_initial.sh', certName, domainsCsv, email, autoRenewStr, remark];
  const res = await dockerAdvancedManager.executeCommand(target.containerId, cmd, { tty: false, quiet: true });
  if (!res || res.exitCode !== 0) {
    const msg = (res && (res.errorOutput || res.output)) || '';
    throw new Error('申请证书失败' + (msg ? ': ' + String(msg).trim() : ''));
  }
  const certDir = getPath('data', 'www', 'openresty', 'certs', certName);
  const metaFile = path.join(certDir, 'meta.json');
  let meta = null;
  try {
    const txt = fs.readFileSync(metaFile, 'utf8');
    if (txt && txt.trim()) {
      meta = JSON.parse(txt);
    }
  } catch {
    meta = null;
  }
  return {
    success: true,
    containerId: target.containerId,
    exitCode: res.exitCode,
    output: res.output,
    errorOutput: res.errorOutput,
    meta,
    certName,
    domains,
    email,
    autoRenew
  };
}

/**
 * 获取证书列表主 JSON
 * 直接读取由 OpenResty 容器脚本维护的 certs/index.json
 */
async function getCertIndex() {
  const indexFile = getPath('data', 'www', 'openresty', 'certs', 'index.json');
  let txt;
  try {
    txt = fs.readFileSync(indexFile, 'utf8');
  } catch {
    // 文件不存在或读取失败时，返回空列表结构，避免前端直接崩溃
    return { certs: [] };
  }
  if (!txt || !txt.trim()) {
    return { certs: [] };
  }
  let data;
  try {
    data = JSON.parse(txt);
  } catch {
    // JSON 解析失败说明数据损坏，抛错交给上层处理
    throw new Error('证书列表数据损坏，请尝试重建索引');
  }
  if (!data || typeof data !== 'object') {
    return { certs: [] };
  }
  if (!Array.isArray(data.certs)) {
    data.certs = [];
  }
  return data;
}

/**
 * 校验并规范化证书名称
 * 防止路径穿越，仅允许字母、数字、下划线和中划线
 */
function normalizeCertName(raw) {
  const name = String(raw || '').trim();
  if (!name) throw new Error('证书名不能为空');
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('证书名包含非法字符');
  return name;
}

function generateRandomCertName(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 10; i++) {
    let result = '';
    for (let j = 0; j < length; j++) {
      const idx = Math.floor(Math.random() * chars.length);
      result += chars[idx];
    }
    if (!/^[0-9]+$/.test(result)) return result;
  }
  return 'cert_' + Date.now().toString(36);
}

 

/**
 * 获取指定证书的 meta.json 内容
 * 仅返回 JSON，不包含证书文件内容
 */
async function getCertMeta(certName) {
  const name = normalizeCertName(certName);
  const certDir = getPath('data', 'www', 'openresty', 'certs', name);
  const metaFile = path.join(certDir, 'meta.json');
  let txt;
  try {
    txt = fs.readFileSync(metaFile, 'utf8');
  } catch {
    throw new Error('证书不存在或元数据文件缺失');
  }
  if (!txt || !txt.trim()) {
    throw new Error('证书元数据为空');
  }
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error('证书元数据损坏');
  }
}

/**
 * 获取指定证书的公钥证书内容（fullchain.pem）
 * 不解析证书，仅原样返回 PEM 文本
 */
async function getCertPublicPem(certName) {
  const name = normalizeCertName(certName);
  const certDir = getPath('data', 'www', 'openresty', 'certs', name);
  const pemFile = path.join(certDir, 'fullchain.pem');
  try {
    return fs.readFileSync(pemFile, 'utf8');
  } catch {
    throw new Error('公钥证书文件不存在或无法读取');
  }
}

/**
 * 获取指定证书的私钥内容（privkey.pem）
 * 不对外暴露路径，仅原样返回 PEM 文本
 */
async function getCertPrivatePem(certName) {
  const name = normalizeCertName(certName);
  const certDir = getPath('data', 'www', 'openresty', 'certs', name);
  const keyFile = path.join(certDir, 'privkey.pem');
  try {
    return fs.readFileSync(keyFile, 'utf8');
  } catch {
    throw new Error('私钥文件不存在或无法读取');
  }
}

/**
 * 在 OpenResty 容器内执行证书索引修复脚本
 * 调用 /www/scripts/rebuild_certs_index.sh rebuild 重建 certs/index.json
 */
async function repairCertIndex() {
  const target = await getOpenrestyContainer();
  const cmd = ['/www/scripts/rebuild_certs_index.sh', 'rebuild'];
  const res = await dockerAdvancedManager.executeCommand(target.containerId, cmd, { tty: false, quiet: true });
  if (!res || res.exitCode !== 0) {
    const msg = (res && (res.errorOutput || res.output)) || '';
    throw new Error('修复证书索引失败' + (msg ? ': ' + String(msg).trim() : ''));
  }
  return {
    success: true,
    containerId: target.containerId,
    exitCode: res.exitCode,
    output: res.output,
    errorOutput: res.errorOutput
  };
}

/**
 * 更新指定证书的 meta.json 内容
 * 仅允许修改 remark、email、autoRenew 等管理字段
 */
async function updateCertMeta(certName, changes = {}) {
  const name = normalizeCertName(certName);
  const certDir = getPath('data', 'www', 'openresty', 'certs', name);
  const metaFile = path.join(certDir, 'meta.json');
  let txt;
  try {
    txt = fs.readFileSync(metaFile, 'utf8');
  } catch {
    throw new Error('证书不存在或元数据文件缺失');
  }
  if (!txt || !txt.trim()) {
    throw new Error('证书元数据为空');
  }
  let meta;
  try {
    meta = JSON.parse(txt);
  } catch {
    throw new Error('证书元数据损坏');
  }
  const next = meta && typeof meta === 'object' ? { ...meta } : {};
  if (Object.prototype.hasOwnProperty.call(changes, 'remark')) {
    const remark = String(changes.remark || '').trim();
    next.remark = remark;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'email')) {
    const email = String(changes.email || '').trim();
    if (!email) throw new Error('邮箱不能为空');
    next.email = email;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'autoRenew')) {
    const v = changes.autoRenew;
    const autoRenew = v === undefined || v === null ? true : !!v;
    next.auto_renew = autoRenew;
  }
  const json = JSON.stringify(next, null, 2);
  fs.writeFileSync(metaFile, json, 'utf8');
  return next;
}

/**
 * 上传证书文件并导入为托管证书
 * 通过容器内 rebuild_certs_index.sh import 生成 meta.json 和 index.json
 */
async function uploadCert(options = {}) {
  const publicPem = String(options.publicPem || '').trim();
  const privatePem = String(options.privatePem || '').trim();
  if (!publicPem || !publicPem.includes('BEGIN CERTIFICATE')) {
    throw new Error('公钥证书内容无效');
  }
  if (!privatePem || !privatePem.includes('BEGIN')) {
    throw new Error('私钥内容无效');
  }
  const rawName = options.certName;
  const generatedName = rawName && String(rawName || '').trim() ? String(rawName || '').trim() : generateRandomCertName(6);
  const certName = normalizeCertName(generatedName);
  const emailInput = String(options.email || '').trim();
  const email = emailInput || 'upload-cert@local.invalid';
  const remark = String(options.remark || '').trim();
  const certsRoot = getPath('data', 'www', 'openresty', 'certs');
  const tmpDir = path.join(certsRoot, '.upload_tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const fullchainTmp = path.join(tmpDir, certName + '.fullchain.pem');
  const privkeyTmp = path.join(tmpDir, certName + '.privkey.pem');
  fs.writeFileSync(fullchainTmp, publicPem, 'utf8');
  fs.writeFileSync(privkeyTmp, privatePem, 'utf8');
  const target = await getOpenrestyContainer();
  const fullchainInContainer = '/www/certs/.upload_tmp/' + certName + '.fullchain.pem';
  const privkeyInContainer = '/www/certs/.upload_tmp/' + certName + '.privkey.pem';
  const cmd = [
    '/www/scripts/rebuild_certs_index.sh',
    'import_auto',
    certName,
    email,
    fullchainInContainer,
    privkeyInContainer,
    remark
  ];
  const res = await dockerAdvancedManager.executeCommand(target.containerId, cmd, { tty: false, quiet: true });
  if (!res || res.exitCode !== 0) {
    const msg = (res && (res.errorOutput || res.output)) || '';
    throw new Error('上传证书失败' + (msg ? ': ' + String(msg).trim() : ''));
  }
  let meta = null;
  try {
    meta = await getCertMeta(certName);
  } catch {
    meta = null;
  }
  let domains = [];
  if (meta && typeof meta.domains_csv === 'string') {
    domains = String(meta.domains_csv || '')
      .split(',')
      .map(v => String(v || '').trim())
      .filter(Boolean);
  }
  return {
    success: true,
    containerId: target.containerId,
    exitCode: res.exitCode,
    output: res.output,
    errorOutput: res.errorOutput,
    meta,
    certName,
    domains,
    email
  };
}

/**
 * 删除指定证书目录并重建证书索引 (异步任务模式)
 * 使用临时容器执行强制删除，解决权限问题
 */
async function deleteCert(certName) {
  const name = normalizeCertName(certName);
  const certDir = getPath('data', 'www', 'openresty', 'certs', name);
  
  if (!fs.existsSync(certDir)) {
    throw new Error('证书不存在');
  }

  // 创建一个组合任务：强制删除 -> 重建索引
  const taskId = taskManager.createTask('ssl-cert-delete', { certName: name });
  
  taskManager.executeTask(taskId, async (_id, progress, addLog) => {
    try {
      progress(10, '准备删除证书目录');
      
      // 1. 调用 runForceDelete 执行删除
      addLog(`执行强制删除: ${certDir}`);
      await runForceDelete(dockerManager.docker, certDir, 'directory', null, (p, m) => {
        // 将 force-delete 的进度 (0-100) 映射到总进度的 (10-80)
        const percent = 10 + Math.floor(p * 0.7);
        progress(percent, `删除中: ${m}`);
      }, addLog);
      
      progress(80, '删除完成，开始重建索引');
      addLog('开始重建证书索引');
      
      // 2. 重建索引
      await repairCertIndex();
      
      progress(100, '证书删除并重建索引完成');
      addLog('操作全部完成');
      
      taskManager.updateTask(_id, { result: { success: true, certName: name } });
    } catch (e) {
      addLog(`操作失败: ${e.message}`);
      throw e;
    }
  });

  return { success: true, taskId, message: '证书删除任务已创建' };
}

module.exports = {
  issueInitialCert,
  getCertIndex,
  getCertMeta,
  getCertPublicPem,
  getCertPrivatePem,
  repairCertIndex,
  updateCertMeta,
  uploadCert,
  deleteCert
};
