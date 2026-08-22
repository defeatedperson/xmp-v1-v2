const fs = require('fs');
const speakeasy = require('speakeasy');
const { getPath } = require('../../config/paths');

/**
 * 函数1：关闭MFA验证（清空totpSecret字段）
 * 将account.json中的totpSecret设置为空字符串，表示关闭二次验证
 * @returns {Object} 返回对象：{ success: boolean, message: string }
 */
function disableMFA() {
  try {
    // 1. 获取账户文件路径
    const accountPath = getPath('data', 'account.json');
    
    // 2. 检查文件是否存在
    if (!fs.existsSync(accountPath)) {
      return { success: false, message: '账户文件不存在' };
    }
    
    // 3. 读取账户文件
    let accountData;
    try {
      accountData = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
    } catch {
      return { success: false, message: '账户文件格式错误' };
    }
    
    // 4. 清空totpSecret字段
    accountData.totpSecret = '';
    
    // 5. 写回文件
    fs.writeFileSync(accountPath, JSON.stringify(accountData, null, 2));
    
    // 6. 返回成功结果
    return { success: true, message: 'MFA验证已关闭' };
    
  } catch (error) {
    console.error('关闭MFA验证错误:', error);
    return { success: false, message: '系统错误' };
  }
}

/**
 * 函数2：生成TOTP密钥
 * 生成符合RFC 6238标准的Base32编码TOTP密钥
 * @returns {Object} 返回对象：{ success: boolean, data?: Object, message?: string }
 * data对象包含：{ secret: string }
 */
function generateTOTPSecret() {
  try {
    // 1. 生成TOTP密钥
    const secret = speakeasy.generateSecret({
      name: 'XMP系统',           // 显示名称
      issuer: 'XMP',             // 发行者
      length: 32,              // 密钥长度（32字符）
      symbols: false           // 不包含特殊符号，提高兼容性
    });
    
    // 2. 返回密钥信息（仅返回密钥，前端自行构建二维码）
    return {
      success: true,
      data: {
        secret: secret.base32      // Base32编码的密钥
      }
    };
    
  } catch (error) {
    console.error('生成TOTP密钥错误:', error);
    return { success: false, message: '生成密钥失败' };
  }
}

/**
 * 函数3：验证并更新MFA密钥
 * 验证用户输入的6位数字验证码，验证通过后更新account.json中的totpSecret
 * @param {string} verificationCode - 用户输入的6位数字验证码
 * @param {string} totpSecret - 待验证的TOTP密钥（Base32编码）
 * @returns {Object} 返回对象：{ success: boolean, message: string }
 */
function verifyAndUpdateMFA(verificationCode, totpSecret) {
  try {
    // 1. 参数验证
    if (!verificationCode || !totpSecret) {
      return { success: false, message: '参数不完整' };
    }
    
    // 2. 验证验证码格式（6位数字）
    const codeRegex = /^\d{6}$/;
    if (!codeRegex.test(verificationCode)) {
      return { success: false, message: '验证码格式错误，必须为6位数字' };
    }
    
    // 3. 验证TOTP密钥格式（Base32）
    const base32Regex = /^[A-Z2-7]+$/;
    if (!base32Regex.test(totpSecret.toUpperCase())) {
      return { success: false, message: 'TOTP密钥格式错误' };
    }
    
    // 4. 验证6位数字验证码
    const verified = speakeasy.totp.verify({
      secret: totpSecret,
      encoding: 'base32',
      token: verificationCode,
      window: 2  // 允许2个时间窗口的误差（±60秒）
    });
    
    if (!verified) {
      return { success: false, message: '验证码错误' };
    }
    
    // 5. 获取账户文件路径
    const accountPath = getPath('data', 'account.json');
    
    // 6. 检查文件是否存在
    if (!fs.existsSync(accountPath)) {
      return { success: false, message: '账户文件不存在' };
    }
    
    // 7. 读取账户文件
    let accountData;
    try {
      accountData = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
    } catch {
      return { success: false, message: '账户文件格式错误' };
    }
    
    // 8. 更新totpSecret字段
    accountData.totpSecret = totpSecret;
    
    // 9. 写回文件
    fs.writeFileSync(accountPath, JSON.stringify(accountData, null, 2));
    
    // 10. 返回成功结果
    return { success: true, message: 'MFA验证设置成功' };
    
  } catch (error) {
    console.error('验证并更新MFA错误:', error);
    return { success: false, message: '系统错误' };
  }
}

// 导出三个函数
module.exports = {
  disableMFA,
  generateTOTPSecret,
  verifyAndUpdateMFA
};