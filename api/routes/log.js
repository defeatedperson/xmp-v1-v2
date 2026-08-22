const express = require('express');
const router = express.Router();
const { getList } = require('../function/basic/log');

/**
 * 获取日志列表路由
 * GET /api/logs?d=-1
 */
router.get('/api/logs', async (req, res) => {
  try {
    const raw = req.query.d !== undefined ? req.query.d : '';
    const offset = raw === '' ? 0 : Number.parseInt(String(raw), 10);
    if (!Number.isFinite(offset) || offset > 0 || offset < -6) {
      return res.status(400).json({ success: false, message: '无效的日期偏移，仅支持 0,-1,-2...-6' });
    }
    const result = await getList(offset);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取日志列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取日志列表失败'
    });
  }
});

module.exports = router;
