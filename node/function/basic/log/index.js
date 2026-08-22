const { writeLog } = require('./writer');
const { getList } = require('./reader');
const { cleanOldLogs, cleanLogsByType } = require('./cleaner');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

setInterval(() => {
  cleanOldLogs().catch(() => {});
}, ONE_DAY_MS);

/**
 * 日志系统主模块
 * 提供系统业务日志的写入、读取和清理功能
 * 使用全局路径配置，无需传入appRoot参数
 */

// 写入日志的便捷函数
async function info(title, content) {
  return writeLog('info', title, content);
}

async function error(title, content) {
  return writeLog('error', title, content);
}

async function warning(title, content) {
  return writeLog('warning', title, content);
}

async function debug(title, content) {
  return writeLog('debug', title, content);
}

// 导出所有功能
module.exports = {
  // 写入日志
  write: writeLog,
  info,
  error,
  warning,
  debug,
  
  // 读取日志
  getList,
  
  // 清理日志
  clean: cleanOldLogs,
  cleanByType: cleanLogsByType
};
