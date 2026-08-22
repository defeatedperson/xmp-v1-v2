const express = require('express');
const router = express.Router();
const { readJson, saveJson, calcETag } = require('../function/matters');

router.get('/api/matters', async (_req, res) => {
  try {
    const data = await readJson();
    const etag = calcETag(data);
    res.set('ETag', etag);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '读取失败', error: error.message });
  }
});

router.put('/api/matters', async (req, res) => {
  try {
    const etag = req.headers['if-match'];
    const result = await saveJson(req.body, etag ? { etag } : {});
    res.set('ETag', result.etag);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ETAG_MISMATCH') {
      return res.status(412).json({ success: false, message: '内容已变更' });
    }
    if (error.code === 'LIMIT_EXCEEDED') {
      return res.status(400).json({ success: false, message: '最多只能有6条代办事项' });
    }
    if (error.code === 'EINVAL') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
});

module.exports = router;
