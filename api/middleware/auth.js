/**
 * 鉴权中间件
 * 验证用户token和IP地址的匹配性
 * 支持双白名单机制：
 * 1. 登录白名单：已登录用户禁止访问（防止重复登录）
 * 2. 其他白名单：无需验证token即可访问
 */

const { getRealIP } = require('../function/basic/getRealIP');
const { validateToken } = require('../function/basic/login/account-token');

/**
 * 登录白名单 - 已登录用户禁止访问（防止重复登录）
 */
const LOGIN_WHITE_LIST = [
  '/api/login',       // 登录接口
  '/login',           // 登录页面
];

/**
 * 其他白名单 - 无需验证token即可访问
 */
const OTHER_WHITE_LIST = [
  '/api/robot',       // 人机验证（生成验证码）
  '/favicon.ico',     // 网站图标
  '/api/logout',      // 退出登录接口
];

/**
 * 检查路由是否在登录白名单中
 * @param {string} path - 请求路径
 * @returns {boolean} 是否在登录白名单中
 */
function isInLoginWhiteList(path) {
  return LOGIN_WHITE_LIST.some(pattern => {
    if (typeof pattern === 'string') {
      return path === pattern;
    }
    // 正则表达式匹配
    return pattern.test(path);
  });
}

/**
 * 检查路由是否在其他白名单中
 * @param {string} path - 请求路径
 * @returns {boolean} 是否在其他白名单中
 */
function isInOtherWhiteList(path) {
  return OTHER_WHITE_LIST.some(pattern => {
    if (typeof pattern === 'string') {
      return path === pattern;
    }
    // 正则表达式匹配
    return pattern.test(path);
  });
}

/**
 * 鉴权中间件
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件函数
 */
function authMiddleware(req, res, next) {
  try {
    // 检查是否在登录白名单中
    if (isInLoginWhiteList(req.path)) {
      // 获取auth_token cookie
      const token = req.cookies?.auth_token;
      
      // 如果用户已登录（token存在且有效），拒绝访问登录页面
      if (token) {
        // 获取客户端真实IP地址
        const clientIP = getRealIP(req);
        
        // 验证token和IP的匹配性
        if (clientIP && clientIP !== 'unknown') {
          const isValid = validateToken(token, clientIP);
          if (isValid) {
            // 用户已登录，拒绝重复登录
            return res.status(403).json({
              success: false,
              message: '您已登录，无需重复登录'
            });
          }
        }
      }
      
      // 用户未登录，允许访问登录页面
      return next();
    }

    // 检查是否在其他白名单中
    if (isInOtherWhiteList(req.path)) {
      return next();
    }

    // 获取auth_token cookie
    const token = req.cookies?.auth_token;
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供认证token'
      });
    }

    // 获取客户端真实IP地址
    const clientIP = getRealIP(req);
    if (!clientIP || clientIP === 'unknown') {
      return res.status(400).json({
        success: false,
        message: '无法获取客户端IP地址'
      });
    }

    // 验证token和IP的匹配性
    const isValid = validateToken(token, clientIP);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'token验证失败或已过期'
      });
    }

    // 验证通过，将用户信息附加到请求对象上
    req.user = {
      ip: clientIP,
      token: token
    };

    // 继续处理请求
    next();

  } catch (error) {
    console.error('鉴权中间件错误:', error);
    return res.status(500).json({
      success: false,
      message: '鉴权过程发生错误'
    });
  }
}

module.exports = {
  authMiddleware,
  LOGIN_WHITE_LIST,
  OTHER_WHITE_LIST
};