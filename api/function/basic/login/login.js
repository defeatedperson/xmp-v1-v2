const fs = require('fs');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const { getPath } = require('../../../config/paths');
const robot = require('../robot');

/**
 * 用户登录验证
 * @param {string} username - 用户名（明文）
 * @param {string} password - 密码（明文）
 * @param {string} captcha - 人机验证码（7位纯数字）
 * @param {string} totpCode - TOTP验证码（6位纯数字，可选）
 * @returns {Object} 返回对象：{ success: boolean, message: string }
 */
async function login(username, password, captcha, totpCode = null) {
  try {
    // 1. 输入格式验证
    const usernameRegex = /^[a-zA-Z0-9,.]+$/;
    const passwordRegex = /^[a-zA-Z0-9,.]+$/;
    const captchaRegex = /^\d{7}$/;
    const totpRegex = /^\d{6}$/;

    if (!username || !usernameRegex.test(username)) {
      return { success: false, message: '用户名格式错误' };
    }
    if (!password || !passwordRegex.test(password)) {
      return { success: false, message: '密码格式错误' };
    }
    if (!captcha || !captchaRegex.test(captcha)) {
      return { success: false, message: '人机验证码格式错误' };
    }
    if (totpCode && !totpRegex.test(totpCode)) {
      return { success: false, message: 'TOTP验证码格式错误' };
    }

    // 2. 人机验证
    const captchaResult = robot.validator.validateCaptcha(captcha);
    if (!captchaResult.valid) {
      return { success: false, message: captchaResult.message };
    }

    // 3. 读取账户文件
    const accountPath = getPath('data', 'account.json');
    const defaultAccount = {
      "username": "$2a$10$3dUgHpNtVXGgQxMlhaaM/uJZvtnvUu9yO28lQa/AlDtCc2zJrCwda",
      "password": "$2a$10$bAf8semV8gO0w958CXMm.OxVqwBrqbsHxzfsWLiLdULK7HJVoNFZa",
      "totpSecret": ""
    };

    let accountData;
    let needsWrite = false;

    if (!fs.existsSync(accountPath)) {
      accountData = defaultAccount;
      needsWrite = true;
    } else {
      try {
        accountData = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
      } catch {
        accountData = defaultAccount;
        needsWrite = true;
      }
    }

    if (needsWrite) {
      try {
        fs.writeFileSync(accountPath, JSON.stringify(accountData, null, 2), 'utf8');
      } catch (e) {
        console.error('无法创建默认账户文件:', e);
        // 如果写入失败，可能仍然可以使用内存中的 defaultAccount 继续验证（尽管下次还会失败）
        // 或者返回错误。为了健壮性，这里选择继续，但打印错误。
      }
    }

    // 4. 验证用户名和密码
    // 使用bcrypt.compare将明文与存储的哈希值进行比较
    const isUsernameValid = await bcrypt.compare(username, accountData.username);
    const isPasswordValid = await bcrypt.compare(password, accountData.password);

    if (!isUsernameValid || !isPasswordValid) {
      return { success: false, message: '账密验证失败' };
    }

    // 5. TOTP验证（如果开启）
    const totpEnabled = accountData.totpSecret && accountData.totpSecret.trim() !== '';
    if (totpEnabled) {
      if (!totpCode) {
        return { success: false, message: '需要二次验证' };
      }

      const verified = speakeasy.totp.verify({
        secret: accountData.totpSecret,
        encoding: 'base32',
        token: totpCode,
        window: 2 // 允许2个时间窗口的误差
      });

      if (!verified) {
        return { success: false, message: 'MFA密钥错误' };
      }
    }

    // 6. 登录成功
    return { success: true, message: '登录成功' };

  } catch (error) {
    console.error('登录验证错误:', error);
    return { success: false, message: '系统错误' };
  }
}

module.exports = login;
