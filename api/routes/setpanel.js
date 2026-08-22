const express = require('express');
const router = express.Router();
const checkMFARequired = require('../function/basic/login/get');
const { disableMFA, generateTOTPSecret, verifyAndUpdateMFA } = require('../function/setpanel/mfa');
const updateAccount = require('../function/setpanel/account');
const { regenerateCA, getCertExpiry, ensureCA } = require('../function/node/node-ca');

/**
 * GET /api/set/status
 * 获取MFA设置状态
 * 返回当前是否已启用MFA
 */
router.get('/api/set/status', (_req, res) => {
  try {
    // 检查是否需要二次验证（即MFA是否已启用）
    const mfaEnabled = checkMFARequired();
    
    res.json({
      success: true,
      mfaEnabled: mfaEnabled
    });
  } catch (error) {
    console.error('获取MFA状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取MFA状态失败',
      error: error.message
    });
  }
});

/**
 * GET /api/set/getmfa
 * 生成MFA密钥
 * 仅在MFA未开启时允许生成新密钥
 */
router.get('/api/set/getmfa', (_req, res) => {
  try {
    // 1. 检查MFA当前状态
    const mfaEnabled = checkMFARequired();
    
    // 2. 如果MFA已开启，拒绝生成新密钥
    if (mfaEnabled) {
      return res.json({
        success: false,
        message: 'MFA已开启，无法生成新密钥'
      });
    }
    
    // 3. 生成新的TOTP密钥
    const result = generateTOTPSecret();
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('生成MFA密钥失败:', error);
    res.status(500).json({
      success: false,
      message: '生成MFA密钥失败',
      error: error.message
    });
  }
});

/**
 * POST /api/set/onmfa
 * 启用MFA
 * 验证6位数字验证码并保存密钥
 * 仅在MFA未开启时允许启用
 */
router.post('/api/set/onmfa', (req, res) => {
  try {
    // 1. 检查MFA当前状态
    const mfaEnabled = checkMFARequired();
    
    // 2. 如果MFA已开启，拒绝再次启用
    if (mfaEnabled) {
      return res.json({
        success: false,
        message: 'MFA已开启，无需重复设置'
      });
    }
    
    // 3. 提取请求参数
    const { code, secret } = req.body;
    
    // 4. 参数验证
    if (!code || !secret) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数：code和secret'
      });
    }
    
    // 5. 验证并更新MFA
    const result = verifyAndUpdateMFA(code, secret);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'MFA启用成功'
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('启用MFA失败:', error);
    res.status(500).json({
      success: false,
      message: '启用MFA失败',
      error: error.message
    });
  }
});

/**
 * POST /api/set/offmfa
 * 关闭MFA
 * 清空totpSecret字段
 */
router.post('/api/set/offmfa', (_req, res) => {
  try {
    // 调用disableMFA函数关闭MFA
    const result = disableMFA();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'MFA已关闭'
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('关闭MFA失败:', error);
    res.status(500).json({
      success: false,
      message: '关闭MFA失败',
      error: error.message
    });
  }
});

/**
 * POST /api/set/account
 * 修改账户信息（用户名或密码）
 * 只需要传入类型和新值即可修改
 */
router.post('/api/set/account', async (req, res) => {
  try {
    // 1. 提取请求参数
    const { type, newValue } = req.body;
    
    // 2. 参数验证
    if (!type || !newValue) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数：type和newValue'
      });
    }
    
    // 3. 验证修改类型
    if (type !== 'username' && type !== 'password') {
      return res.status(400).json({
        success: false,
        message: '修改类型错误，必须是 username 或 password'
      });
    }
    
    // 4. 调用updateAccount函数修改账户信息
    const result = await updateAccount(type, newValue);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('修改账户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '修改账户信息失败',
      error: error.message
    });
  }
});

/**
 * POST /api/set/regenca
 * 重新生成CA证书
 */
router.post('/api/set/regenca', async (_req, res) => {
  try {
    await regenerateCA();
    res.json({
      success: true,
      message: 'CA证书已重新生成'
    });
  } catch (error) {
    console.error('重新生成CA证书失败:', error);
    res.status(500).json({
      success: false,
      message: '重新生成CA证书失败',
      error: error.message
    });
  }
});

/**
 * GET /api/set/caexpiry
 * 获取CA证书到期时间
 */
router.get('/api/set/caexpiry', async (_req, res) => {
  try {
    const ca = await ensureCA();
    const expiry = getCertExpiry(ca.ca.cert);
    res.json({
      success: true,
      notAfter: expiry.notAfter,
      remainingHours: expiry.remainingHours,
      isExpired: expiry.isExpired
    });
  } catch (error) {
    console.error('获取CA到期时间失败:', error);
    res.status(500).json({
      success: false,
      message: '获取CA到期时间失败',
      error: error.message
    });
  }
});

module.exports = router;