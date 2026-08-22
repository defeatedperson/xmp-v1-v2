// 内存存储管理
let currentCaptcha = null;
let expiryTime = null;

// 存储验证码
function storeCaptcha(code) {
  currentCaptcha = code;
  // 设置5分钟有效期
  expiryTime = Date.now() + 5 * 60 * 1000;
}

// 获取验证码
function getCaptcha() {
  // 检查是否过期
  if (expiryTime && Date.now() > expiryTime) {
    currentCaptcha = null;
    expiryTime = null;
  }
  return currentCaptcha;
}

// 清除验证码
function clearCaptcha() {
  currentCaptcha = null;
  expiryTime = null;
}

module.exports = {
  storeCaptcha,
  getCaptcha,
  clearCaptcha
};