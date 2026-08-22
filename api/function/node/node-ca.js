// 修复：为IP地址写入正确的 SAN 编码，避免 TLS 主机名校验失败
const forge = require('node-forge');
const net = require('net');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { getPath } = require('../../config/paths');
const { getAddressById } = require('./dataTool');
const logger = require('../basic/log');

const CA_DAYS = 365 * 20;
const NODE_DAYS = 365 * 5;
const CLIENT_CERT_HOURS = 12;
const CLIENT_CERT_RENEW_THRESHOLD_HOURS = 4;

function getCertDir() {
  return getPath('data', 'ca');
}

async function ensureDir() {
  const dir = getCertDir();
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getCertExpiry(pemCert) {
  const cert = forge.pki.certificateFromPem(pemCert);
  const now = new Date();
  const remainingMs = cert.validity.notAfter - now;
  const remainingHours = remainingMs / (1000 * 60 * 60);
  return {
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    remainingHours: remainingHours,
    isExpired: remainingHours <= 0,
    shouldRenew: remainingHours < CLIENT_CERT_RENEW_THRESHOLD_HOURS
  };
}

function generateCA() {
  const keys = forge.pki.rsa.generateKeyPair(4096);

  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;

  const now = new Date();
  cert.validity.notBefore = now;
  cert.validity.notAfter = new Date(now.getFullYear() + (CA_DAYS / 365), now.getMonth(), now.getDate());

  const attrs = [
    { name: 'commonName', value: 'XCC Root CA' },
    { name: 'organizationName', value: 'XCC System' }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, crlSign: true, digitalSignature: true }
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  };
}

function generateClientCert(caKeyPem, caCertPem) {
  const keys = forge.pki.rsa.generateKeyPair(4096);

  const caKey = forge.pki.privateKeyFromPem(caKeyPem);
  const caCert = forge.pki.certificateFromPem(caCertPem);

  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;

  const now = new Date();
  const notAfter = new Date(now.getTime() + CLIENT_CERT_HOURS * 60 * 60 * 1000);
  cert.validity.notBefore = now;
  cert.validity.notAfter = notAfter;

  const attrs = [
    { name: 'commonName', value: 'XCC Controller' },
    { name: 'organizationName', value: 'XCC System' }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(caCert.subject.attributes);

  cert.setExtensions([
    { name: 'extKeyUsage', clientAuth: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true }
  ]);

  cert.sign(caKey, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  };
}

function buildAltNames(hostname) {
  const value = String(hostname || '').trim();
  if (!value) return [];
  const ipType = net.isIP(value);
  if (ipType) {
    return [{ type: 7, ip: value }];
  }
  return [{ type: 2, value }];
}

function generateNodeCert(caKeyPem, caCertPem, nodeId, hostname) {
  const keys = forge.pki.rsa.generateKeyPair(4096);

  const caKey = forge.pki.privateKeyFromPem(caKeyPem);
  const caCert = forge.pki.certificateFromPem(caCertPem);

  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;

  const now = new Date();
  cert.validity.notBefore = now;
  cert.validity.notAfter = new Date(now.getFullYear() + (NODE_DAYS / 365), now.getMonth(), now.getDate());

  const attrs = [
    { name: 'commonName', value: `Node ${nodeId}` },
    { name: 'organizationName', value: 'XCC System' }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(caCert.subject.attributes);

  const altNames = buildAltNames(hostname);
  const extensions = [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
  ];
  if (altNames.length) {
    extensions.push({ name: 'subjectAltName', altNames });
  }
  cert.setExtensions(extensions);

  cert.sign(caKey, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  };
}

async function ensureCA() {
  const dir = await ensureDir();
  const caKeyPath = path.join(dir, 'ca.key');
  const caCertPath = path.join(dir, 'ca.crt');
  const clientKeyPath = path.join(dir, 'client.key');
  const clientCertPath = path.join(dir, 'client.crt');

  const keyExists = await fileExists(caKeyPath);
  const certExists = await fileExists(caCertPath);
  const clientKeyExists = await fileExists(clientKeyPath);
  const clientCertExists = await fileExists(clientCertPath);

  if (keyExists && certExists && clientKeyExists && clientCertExists) {
    return {
      initialized: true,
      ca: {
        key: (await fsp.readFile(caKeyPath, 'utf8')).trim(),
        cert: (await fsp.readFile(caCertPath, 'utf8')).trim()
      },
      client: {
        key: (await fsp.readFile(clientKeyPath, 'utf8')).trim(),
        cert: (await fsp.readFile(clientCertPath, 'utf8')).trim()
      }
    };
  }

  logger.info('NodeCA', '正在生成 CA 证书...');
  const ca = generateCA();
  const client = generateClientCert(ca.key, ca.cert);

  await fsp.writeFile(caKeyPath, ca.key, 'utf8');
  await fsp.writeFile(caCertPath, ca.cert, 'utf8');
  await fsp.writeFile(clientKeyPath, client.key, 'utf8');
  await fsp.writeFile(clientCertPath, client.cert, 'utf8');

  logger.info('NodeCA', 'CA 证书生成完成');

  return {
    initialized: false,
    ca: {
      key: ca.key,
      cert: ca.cert
    },
    client: {
      key: client.key,
      cert: client.cert
    }
  };
}

async function regenerateCA() {
  const dir = await ensureDir();
  const caKeyPath = path.join(dir, 'ca.key');
  const caCertPath = path.join(dir, 'ca.crt');
  const clientKeyPath = path.join(dir, 'client.key');
  const clientCertPath = path.join(dir, 'client.crt');

  logger.info('NodeCA', '正在重新生成 CA 证书...');

  const ca = generateCA();
  const client = generateClientCert(ca.key, ca.cert);

  await fsp.writeFile(caKeyPath, ca.key, 'utf8');
  await fsp.writeFile(caCertPath, ca.cert, 'utf8');
  await fsp.writeFile(clientKeyPath, client.key, 'utf8');
  await fsp.writeFile(clientCertPath, client.cert, 'utf8');

  logger.info('NodeCA', 'CA 证书重新生成完成');

  return {
    ca: { cert: ca.cert },
    client: { cert: client.cert, key: client.key }
  };
}

async function renewClientCert() {
  const dir = await ensureDir();
  const caKeyPath = path.join(dir, 'ca.key');
  const caCertPath = path.join(dir, 'ca.crt');
  const clientKeyPath = path.join(dir, 'client.key');
  const clientCertPath = path.join(dir, 'client.crt');

  logger.info('NodeCA', '正在续期客户端证书...');

  // 尝试读取现有的 CA
  let caKey, caCert;
  try {
    caKey = await fsp.readFile(caKeyPath, 'utf8');
    caCert = await fsp.readFile(caCertPath, 'utf8');
  } catch (err) {
    logger.warning('NodeCA', '读取 CA 失败，将重新生成 CA: ' + err.message);
    return regenerateCA();
  }

  // 检查 CA 是否过期
  const caExpiry = getCertExpiry(caCert);
  if (caExpiry.isExpired || caExpiry.shouldRenew) {
    logger.warning('NodeCA', 'CA 已过期或即将过期，将重新生成 CA');
    return regenerateCA();
  }

  // 使用现有 CA 生成新的客户端证书
  const client = generateClientCert(caKey, caCert);

  await fsp.writeFile(clientKeyPath, client.key, 'utf8');
  await fsp.writeFile(clientCertPath, client.cert, 'utf8');

  logger.info('NodeCA', '客户端证书续期完成');

  return {
    ca: { cert: caCert },
    client: { cert: client.cert, key: client.key }
  };
}

async function getNodeCert(nodeId) {
  const address = await getAddressById(nodeId);
  if (!address) {
    throw new Error('节点不存在');
  }

  const hostname = address.split(':')[0];

  const ca = await ensureCA();

  const nodeCert = generateNodeCert(ca.ca.key, ca.ca.cert, nodeId, hostname);

  return {
    nodeId,
    hostname,
    caCert: ca.ca.cert,
    nodeCert: nodeCert.cert,
    nodeKey: nodeCert.key
  };
}

async function getClientCert() {
  const ca = await ensureCA();
  return {
    key: ca.client.key,
    cert: ca.client.cert,
    caCert: ca.ca.cert
  };
}

function startClientCertWatcher() {
  const CHECK_INTERVAL = 60 * 60 * 1000;
  
  async function checkAndRenewClientCert() {
    try {
      const ca = await ensureCA();
      const expiry = getCertExpiry(ca.client.cert);
      
      if (expiry.isExpired) {
        await renewClientCert();
      } else if (expiry.shouldRenew) {
        await renewClientCert();
      } else { }
    } catch (err) {
      logger.error('ClientCert', '检查客户端证书失败: ' + err.message);
    }
  }
  
  checkAndRenewClientCert();
  setInterval(checkAndRenewClientCert, CHECK_INTERVAL);
  logger.info('ClientCert', '客户端证书定时检测已启动');
}

module.exports = {
  ensureCA,
  regenerateCA,
  renewClientCert,
  getNodeCert,
  getClientCert,
  getCertExpiry,
  startClientCertWatcher,
  CLIENT_CERT_HOURS,
  CLIENT_CERT_RENEW_THRESHOLD_HOURS
};
