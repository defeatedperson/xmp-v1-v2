const fs = require('fs');
const { getPath } = require('../../config/paths');

function ensureDirectoryExists(filePath) {
  const dir = require('path').dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function updateDockerStore(data) {
  const filePath = getPath('data', 'appstore', 'docker-store.json');
  ensureDirectoryExists(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return { success: true, message: 'docker-store.json 更新成功' };
}

function readDockerStore() {
  const filePath = getPath('data', 'appstore', 'docker-store.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('docker-store.json 不存在');
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data;
}

function updateCustomStore(data) {
  const filePath = getPath('data', 'appstore', 'custom-store.json');
  ensureDirectoryExists(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return { success: true, message: 'custom-store.json 更新成功' };
}

function readCustomStore() {
  const filePath = getPath('data', 'appstore', 'custom-store.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('custom-store.json 不存在');
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data;
}

function ensureCustomStoreExists() {
  const filePath = getPath('data', 'appstore', 'custom-store.json');
  ensureDirectoryExists(filePath);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8');
  }
}

module.exports = {
  updateDockerStore,
  readDockerStore,
  updateCustomStore,
  readCustomStore,
  ensureCustomStoreExists,
};
