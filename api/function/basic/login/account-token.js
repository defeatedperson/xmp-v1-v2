/**
 * 单用户登录token管理模块
 * 使用内存存储，有效期48小时
 * 单用户+单设备登录：每次生成新token会清空所有已有数据
 */

// 内存中的token存储
const tokenStore = new Map();

// 48小时的有效期（毫秒）
const TOKEN_VALIDITY = 48 * 60 * 60 * 1000;

// 清理过期token的定时器
let cleanupTimer = null;

/**
 * 生成随机token字符串
 * @returns {string} 随机token
 */
function generateRandomToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * 清理过期的token记录
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [ip, data] of tokenStore.entries()) {
    if (now > data.expireTime) {
      tokenStore.delete(ip);
    }
  }
}

/**
 * 函数1：生成并存储token（单用户+单设备登录）
 * 每次生成新token前会清空所有已有数据，确保单设备登录
 * @param {string} ipAddress - 用户IP地址
 * @returns {string} 生成的token
 */
function generateToken(ipAddress) {
  if (!ipAddress) {
    throw new Error('IP地址不能为空');
  }

  // 单用户+单设备登录：生成新token前清空所有已有数据
  clearAllTokens();

  // 生成新的随机token
  const token = generateRandomToken();
  const expireTime = Date.now() + TOKEN_VALIDITY;

  // 存储新的token信息（此时tokenStore应为空）
  tokenStore.set(ipAddress, {
    token: token,
    expireTime: expireTime,
    createTime: Date.now()
  });

  // 启动清理定时器（如果还没启动）
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanupExpiredTokens, 60 * 60 * 1000); // 每小时清理一次
  }

  return token;
}

/**
 * 函数2：验证token和IP地址
 * @param {string} token - 待验证的token
 * @param {string} ipAddress - 用户IP地址
 * @returns {boolean} 验证结果
 */
function validateToken(token, ipAddress) {
  if (!token || !ipAddress) {
    return false;
  }

  const tokenData = tokenStore.get(ipAddress);
  
  // IP地址不存在
  if (!tokenData) {
    return false;
  }

  // token不匹配
  if (tokenData.token !== token) {
    return false;
  }

  // token已过期
  if (Date.now() > tokenData.expireTime) {
    tokenStore.delete(ipAddress); // 删除过期记录
    return false;
  }

  return true;
}

/**
 * 函数3：清除所有token信息
 * 删除所有存储的token数据
 * @returns {boolean} 是否清除成功
 */
function removeToken() {
  try {
    tokenStore.clear();
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取当前存储的token数量（调试用）
 * @returns {number} token数量
 */
function clearAllTokens() {
  tokenStore.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// 导出函数
module.exports = {
  generateToken,
  validateToken,
  removeToken,
  clearAllTokens
};