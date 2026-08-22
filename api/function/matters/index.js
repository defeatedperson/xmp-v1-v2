const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { getPath } = require('../../config/paths');
const MAX_ITEMS = 6;
const TITLE_MAX = 64;
const CONTENT_MAX = 1024;

function getFilePath() {
  return getPath('data', 'matters', 'matters.json');
}

async function ensureStore() {
  const dir = getPath('data', 'matters');
  await fsp.mkdir(dir, { recursive: true });
  const file = getFilePath();
  try {
    await fsp.access(file, fs.constants.F_OK);
  } catch {
    await writeJson([]);
  }
}

async function readJson() {
  await ensureStore();
  const file = getFilePath();
  try {
    const content = await fsp.readFile(file, 'utf8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch {
    await writeJson([]);
    return [];
  }
}

function calcETag(data) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(data));
  return h.digest('hex');
}

async function writeJson(data) {
  const file = getFilePath();
  const tmp = file + '.tmp';
  const json = JSON.stringify(data);
  await fsp.writeFile(tmp, json, 'utf8');
  await fsp.rename(tmp, file);
}

function isValidTime(t) {
  if (typeof t === 'number') return Number.isFinite(t);
  if (typeof t === 'string') return !Number.isNaN(Date.parse(t));
  return false;
}

function validateItem(x) {
  if (!x || typeof x !== 'object') return false;
  const title = typeof x.title === 'string' ? x.title.trim() : '';
  const content = typeof x.content === 'string' ? x.content : '';
  const time = x.time;
  const urgent = x.isUrgent;
  if (!title || title.length > TITLE_MAX) return false;
  if (content && content.length > CONTENT_MAX) return false;
  if (!isValidTime(time)) return false;
  if (typeof urgent !== 'boolean') return false;
  return true;
}

async function saveJson(data, opts = {}) {
  if (!Array.isArray(data)) {
    const err = new Error('数据必须为数组');
    err.code = 'EINVAL';
    throw err;
  }
  if (data.length > MAX_ITEMS) {
    const err = new Error('最多只能有6条代办事项');
    err.code = 'LIMIT_EXCEEDED';
    throw err;
  }
  const ok = data.every(validateItem);
  if (!ok) {
    const err = new Error('字段不合法或长度超限');
    err.code = 'EINVAL';
    throw err;
  }
  if (opts.etag) {
    const current = await readJson();
    const currentTag = calcETag(current);
    if (currentTag !== opts.etag) {
      const err = new Error('内容已变更');
      err.code = 'ETAG_MISMATCH';
      throw err;
    }
  }
  await ensureStore();
  await writeJson(data);
  return { etag: calcETag(data) };
}

module.exports = {
  readJson,
  saveJson,
  calcETag
};
