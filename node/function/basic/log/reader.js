const { formatLocalDate, readLogsByDate } = require('./database');

function sortByTimestampDesc(list) {
  return list.sort((a, b) => String(b && b.timestamp || '').localeCompare(String(a && a.timestamp || '')));
}

/**
 * 按天偏移获取日志列表（包含正文）
 * @param {number} dayOffset - 0=今天, -1=昨天, ... -6=六天前
 * @returns {Promise<Array>} 日志数组
 */
async function getList(dayOffset = 0) {
  const off = Number(dayOffset) || 0;
  const d = new Date();
  d.setDate(d.getDate() + off);
  const day = formatLocalDate(d);
  const list = await readLogsByDate(day);
  return sortByTimestampDesc(list);
}

module.exports = {
  getList
};
