const fs = require('fs');
const { getPath } = require('../../../config/paths');

/**
 * 检查是否需要二次验证
 * @returns {boolean} 如果需要二次验证返回true，否则返回false
 */
function checkMFARequired() {
  try {
    // 获取账户文件路径
    const accountPath = getPath('data', 'account.json');
    
    // 检查文件是否存在
    if (!fs.existsSync(accountPath)) {
      console.log('账户文件不存在，不需要二次验证');
      return false;
    }
    
    // 读取文件内容
    const accountData = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
    
    // 检查totpSecret字段是否存在且不为空
    if (!accountData.hasOwnProperty('totpSecret') || 
        accountData.totpSecret === null || 
        accountData.totpSecret === undefined || 
        accountData.totpSecret.trim() === '') {
      console.log('TOTP密钥未设置，不需要二次验证');
      return false;
    }
    
    // totpSecret有值，需要二次验证
    console.log('TOTP密钥已设置，需要二次验证');
    return true;
  } catch (error) {
    console.error('检查二次验证需求时出错:', error);
    // 出错时默认不需要二次验证，确保系统可用性
    return false;
  }
}

module.exports = checkMFARequired;