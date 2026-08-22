const express = require('express');
const router = express.Router();
const { getList } = require('../function/basic/log');
const { parseIntInRange } = require('../function/basic/number-boolean');

/**
 * 获取日志列表路由
 * GET /log/list?d=-1
 */
router.get('/log/list', async (req, res) => {
  try {
    const raw = req.query.d !== undefined ? req.query.d : '';
    const offset = raw === '' ? 0 : parseIntInRange(raw, { min: -6, max: 0, defaultValue: NaN });
    if (!Number.isFinite(offset) || offset > 0 || offset < -6) {
      return res.status(400).json({ success: false, message: '无效的日期偏移，仅支持 0,-1,-2...-6' });
    }
    const result = await getList(offset);

    res.json({
      success: true,
      data: result
    });
  } catch {
    res.status(500).json({
      success: false,
      message: '获取日志列表失败'
    });
  }
});

module.exports = router;
