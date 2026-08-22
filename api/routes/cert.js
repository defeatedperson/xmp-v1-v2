// routes/certs.js (新建或添加到现有路由)
const express = require('express');
const router = express.Router();
const { getClientCert, regenerateCA } = require('../function/node/node-ca');

router.get('/api/certs/client', async (req, res) => {
  try {
    const cert = await getClientCert();
    res.json({
      success: true,
      data: {
        cert: cert.cert,
        key: cert.key
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/certs/regenerate', async (req, res) => {
  try {
    await regenerateCA();
    res.json({ success: true, message: 'CA 证书已重新生成' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;