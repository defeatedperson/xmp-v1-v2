const { isValidDomainName } = require('../basic/domain');
const { validateFileName } = require('../file/path-utils');
const { isSafeIdentifier } = require('../basic/identifier');

function validateDomainName(domain) {
  const d = String(domain || '').trim();
  if (!d || !isValidDomainName(d) || !validateFileName(d)) {
    return { valid: false, domain: d };
  }
  return { valid: true, domain: d };
}

function validateDbIdentifier(dbName, userName = '') {
  const db = String(dbName || '').trim();
  const user = String(userName || '').trim();
  const dbValid = db && isSafeIdentifier(db);
  const userValid = !user || isSafeIdentifier(user);
  return { valid: dbValid && userValid, dbName: db, userName: user };
}

function handleRootAuthError(msg) {
  if (typeof msg !== 'string') return null;
  if (msg.indexOf('ROOT_AUTH_ERROR:') !== 0) return null;
  const detail = msg.slice('ROOT_AUTH_ERROR:'.length) || 'root认证失败';
  return { detail, friendly: 'root密码可能不正确，可尝试在设置中修改root密码解决' };
}

function validatePhpContainerName(containerName) {
  const name = String(containerName || '').trim();
  return { valid: /^php\d{2}$/.test(name), containerName: name };
}

module.exports = {
  validateDomainName,
  validateDbIdentifier,
  handleRootAuthError,
  validatePhpContainerName
};
