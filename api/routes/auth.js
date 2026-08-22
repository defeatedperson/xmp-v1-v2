const express = require('express');
const router = express.Router();
const robot = require('../function/basic/robot');
const { getRealIP } = require('../function/basic/getRealIP');
const checkMFARequired = require('../function/basic/login/get');
const login = require('../function/basic/login/login');
const { generateToken, removeToken } = require('../function/basic/login/account-token');
const log = require('../function/basic/log');

// 人机验证路由 - 生成验证码
router.get('/api/robot', (_req, res) => {
  try {
    const captcha = robot.generator.generateCaptcha();
    res.setHeader('Content-Type', captcha.contentType);
    res.send(captcha.image);
  } catch (error) {
    res.status(500).json({ 
      error: '生成验证码失败',
      message: error.message 
    });
  }
});

// 登录状态检查 - 获取是否需要二次验证
router.get('/api/login', (_req, res) => {
  try {
    const requireMFA = checkMFARequired();
    res.json({
      success: true,
      requireMFA: requireMFA
    });
  } catch (error) {
    console.error('获取登录状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取登录状态失败',
      error: error.message
    });
  }
});

// 用户登录 - 提交登录信息
router.post('/api/login', async (req, res) => {
  try {
    // 获取客户端真实IP
    const clientIP = getRealIP(req);
    
    // 提取登录参数
    const { username, password, captcha, totpCode } = req.body;
    
    // 参数验证
    if (!username || !password || !captcha) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的登录参数'
      });
    }
    
    // 调用登录验证函数
    const loginResult = await login(username, password, captcha, totpCode);
    
    if (!loginResult.success) {
      return res.json({
        success: false,
        message: loginResult.message
      });
    }
    
    // 登录成功，生成token
    const token = generateToken(clientIP);
    
    // 记录登录成功日志
    await log.info('用户登录', `用户 ${username} 从IP ${clientIP} 登录成功`);
    
    // 设置cookie（HTTPS访问/SameSite严格/HttpOnly）
    res.cookie('auth_token', token, {
      maxAge: 48 * 60 * 60 * 1000, // 48小时，与token有效期一致
      httpOnly: true,              // 防止XSS攻击
      secure: true,                // 仅HTTPS传输
      sameSite: 'strict'          // 严格SameSite策略
    });
    
    // 返回登录成功响应
    res.json({
      success: true,
      message: '登录成功',
      requireMFA: false
    });
    
  } catch (error) {
    console.error('登录处理失败:', error);
    res.status(500).json({
      success: false,
      message: '登录处理失败',
      error: error.message
    });
  }
});

// 用户退出登录 - 清除token和cookie
router.post('/api/logout', (_req, res) => {
  try {
    // 调用函数3清除服务器中的所有token
    const clearResult = removeToken();
    
    if (!clearResult) {
      return res.status(500).json({
        success: false,
        message: '清除服务器token失败'
      });
    }
    
    // 清除浏览器中的auth_token cookie
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict'
    });
    
    // 返回退出成功响应
    res.json({
      success: true,
      message: '退出登录成功'
    });
    
  } catch (error) {
    console.error('退出登录处理失败:', error);
    res.status(500).json({
      success: false,
      message: '退出登录处理失败',
      error: error.message
    });
  }
});

module.exports = router;