const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { getPath } = require('../../../config/paths');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatLocalDate(d) {
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function resolveDateString(dateString) {
  const s = String(dateString || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return formatLocalDate(new Date());
}

function ensureLogDir() {
  const logDir = getPath('data', 'log');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  return logDir;
}

function getLogFilePath(dateString) {
  const day = resolveDateString(dateString);
  return path.join(ensureLogDir(), `${day}.jsonl`);
}

function parseLogLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (obj.id === undefined || obj.id === null) return null;
    if (!obj.type || !obj.title || !obj.timestamp) return null;
    return obj;
  } catch {
    return null;
  }
}

async function readLogsByDate(dateString) {
  const filePath = getLogFilePath(dateString);
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const logs = [];
    for (const line of lines) {
      const item = parseLogLine(line);
      if (item) logs.push(item);
    }
    return logs;
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return [];
    throw e;
  }
}

async function appendLogEntry(entry, dateString) {
  const filePath = getLogFilePath(dateString);
  const line = JSON.stringify(entry) + '\n';
  await fsp.appendFile(filePath, line, 'utf8');
  return entry && entry.id;
}

async function findLogById(id, dateString, daysToScan = 7) {
  const targetId = Number(id);
  if (!Number.isFinite(targetId)) return null;

  if (dateString) {
    const list = await readLogsByDate(dateString);
    return list.find(x => Number(x && x.id) === targetId) || null;
  }

  const now = new Date();
  for (let i = 0; i < daysToScan; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = formatLocalDate(d);
    const list = await readLogsByDate(day);
    const hit = list.find(x => Number(x && x.id) === targetId);
    if (hit) return hit;
  }
  return null;
}

async function cleanOldLogFiles(daysToKeep = 7) {
  const keepDays = Math.max(1, Number(daysToKeep) || 7);
  const now = new Date();
  const oldestKeep = new Date(now);
  oldestKeep.setDate(oldestKeep.getDate() - (keepDays - 1));
  const minKeepDay = formatLocalDate(oldestKeep);

  const logDir = ensureLogDir();
  let entries = [];
  try {
    entries = await fsp.readdir(logDir, { withFileTypes: true });
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return 0;
    throw e;
  }

  let removed = 0;
  for (const ent of entries) {
    if (!ent || !ent.isFile()) continue;
    const name = String(ent.name || '');
    const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
    if (!m) continue;
    const day = m[1];
    if (day < minKeepDay) {
      try {
        await fsp.unlink(path.join(logDir, name));
        removed++;
      } catch {}
    }
  }
  return removed;
}

function getDatabasePath() {
  return ensureLogDir();
}

async function getDatabase() {
  return null;
}

async function closeDatabase() {
  return;
}

module.exports = {
  getDatabase,
  getDatabasePath,
  closeDatabase,
  resolveDateString,
  formatLocalDate,
  getLogFilePath,
  readLogsByDate,
  appendLogEntry,
  findLogById,
  cleanOldLogFiles
};
