const { cleanOldLogFiles } = require('./database');

/**
 * 清理过期日志
 * @param {number} daysToKeep - 保留天数（默认30天）
 * @returns {Promise<number>} 删除的记录数
 */
async function cleanOldLogs(daysToKeep = 7) {
  return await cleanOldLogFiles(daysToKeep);
}

/**
 * 清理指定类型的日志
 * @param {string} type - 日志类型
 * @param {number} daysToKeep - 保留天数
 * @returns {Promise<number>} 删除的记录数
 */
async function cleanLogsByType(type, daysToKeep = 7) {
  return await cleanOldLogFiles(daysToKeep);
}

module.exports = {
  cleanOldLogs,
  cleanLogsByType
};
