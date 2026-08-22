const express = require('express');
const router = express.Router();
const dataTool = require('../function/xcc/dataTool');

router.get('/api/xcc/domains', (_req, res) => {
  try {
    const data = dataTool.getDomainList();
    res.status(200).json({ success: true, status: 200, data });
  } catch (error) {
    res.status(500).json({ success: false, status: 500, message: '获取域名列表失败', error: error.message });
  }
});

router.get('/api/xcc/json', (_req, res) => {
  try {
    const data = dataTool.getFileContent();
    res.status(200).json({ success: true, status: 200, data });
  } catch (error) {
    res.status(500).json({ success: false, status: 500, message: '获取JSON失败', error: error.message });
  }
});

router.post('/api/xcc/json', (req, res) => {
  try {
    const payload = req.body;
    const content = payload && Object.prototype.hasOwnProperty.call(payload, 'content') ? payload.content : payload;
    dataTool.setFileContent(content);
    res.status(200).json({ success: true, status: 200 });
  } catch (error) {
    const msg = /域名数量超过限制/.test(String(error && error.message)) ? '域名数量超过限制（最多10个）' : (String(error && error.message || '写入JSON失败'));
    const code = /JSON格式错误|domains必须为数组|内容不能为空|有效JSON字符串/.test(msg) ? 400 : 500;
    res.status(code).json({ success: false, status: code, message: msg, error: error.message });
  }
});

module.exports = router;
