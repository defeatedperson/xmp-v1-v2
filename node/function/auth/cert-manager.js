const fs = require('fs');
const { getPath } = require('../../config/paths');

const CERT_DIR = 'cert';
const REQUIRED_FILES = ['cert.pem', 'cert.key', 'ca.pem'];

function check() {
  const missing = [];
  const certDir = getPath('data', CERT_DIR);

  for (const file of REQUIRED_FILES) {
    const filePath = getPath('data', CERT_DIR, file);
    if (!fs.existsSync(filePath)) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    const certDirExists = fs.existsSync(certDir);
    const hint = certDirExists
      ? `请将以下文件放入 ${certDir} 目录: ${missing.join(', ')}`
      : `请创建 ${certDir} 目录并放入以下文件: ${missing.join(', ')}`;
    throw new Error(`证书文件缺失 - ${missing.join(', ')}。${hint}`);
  }

  return true;
}

function getOptions() {
  check();
  return {
    key: fs.readFileSync(getPath('data', CERT_DIR, 'cert.key')),
    cert: fs.readFileSync(getPath('data', CERT_DIR, 'cert.pem')),
    ca: fs.readFileSync(getPath('data', CERT_DIR, 'ca.pem')),
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  };
}

async function ensureCerts() {
  return getOptions();
}

module.exports = { ensureCerts };
