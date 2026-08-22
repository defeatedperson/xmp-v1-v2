const { appendLogEntry } = require('./database');

let lastTs = 0;
let lastSeq = 0;

function nextId() {
  const ts = Date.now();
  if (ts === lastTs) {
    lastSeq += 1;
  } else {
    lastTs = ts;
    lastSeq = 0;
  }
  return ts * 1000 + lastSeq;
}

/**
 * 写入系统日志
 * @param {string} type - 日志类型
 * @param {string} title - 日志标题
 * @param {string} content - 日志内容
 * @returns {Promise<number>} 插入的日志ID
 */
async function writeLog(type, title, content = '') {
  const entry = {
    id: nextId(),
    type: String(type || '').trim() || 'info',
    title: String(title || '').trim(),
    content: String(content || ''),
    timestamp: new Date().toISOString()
  };
  await appendLogEntry(entry);
  return entry.id;
}

module.exports = {
  writeLog
};
