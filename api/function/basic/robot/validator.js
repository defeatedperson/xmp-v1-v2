// 验证码验证器
const storage = require('./storage');

// 验证验证码
function validateCaptcha(userInput) {
  const storedCode = storage.getCaptcha();
  
  if (!storedCode) {
    return {
      valid: false,
      message: '验证码已过期或不存在'
    };
  }
  
  if (userInput === storedCode) {
    // 验证成功后清除验证码
    storage.clearCaptcha();
    return {
      valid: true,
      message: '验证成功'
    };
  }
  
  return {
    valid: false,
    message: '验证码错误'
  };
}

module.exports = {
  validateCaptcha
};