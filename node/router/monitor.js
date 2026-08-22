const express = require('express');
const http = require('http');
const { getPath } = require('../config/paths');
const { parseIntInRange } = require('../function/basic/number-boolean');

const router = express.Router();

/**
 * 获取监控数据（仅支持GET请求）
 * 将天数参数转发给本地Go程序
 */
router.get('/monitor', (req, res) => {
  const dayOffset = parseIntInRange(req.query && req.query.day_offset, { min: 0, max: 30, defaultValue: 0 });
  if (dayOffset === undefined || dayOffset === null || dayOffset < 0) {
    return res.status(400).json({
      success: false,
      message: '无效的天数偏移量'
    });
  }

  const requestData = { day_offset: dayOffset };
  const requestBody = JSON.stringify(requestData);
  const sockPath = getPath('monitor', 'xmp-monitor.sock');
  
  const options = {
    socketPath: sockPath,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody)
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let responseData = '';
    
    proxyRes.on('data', chunk => responseData += chunk);
    
    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode || 200);
      if (proxyRes.headers['content-type']) {
        res.setHeader('Content-Type', proxyRes.headers['content-type']);
      }
      res.send(responseData);
    });
  });

    proxyReq.on('error', _err => {
    res.status(503).json({
      success: false,
      message: '监控模块不可用'
    });
  });

  proxyReq.setTimeout(30000, () => {
    proxyReq.destroy();
    res.status(504).json({
      success: false,
      message: '监控请求超时'
    });
  });

  proxyReq.write(requestBody);
  proxyReq.end();
});

/**
 * 获取系统资源使用情况
 * 返回CPU、内存占用率
 */
router.get('/system', async (req, res) => {
  const sockPath = getPath('monitor', 'xmp-monitor.sock');
  const options = {
    socketPath: sockPath,
    path: '/system',
    method: 'POST'
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let responseData = '';

    proxyRes.on('data', chunk => responseData += chunk);

    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode || 200);
      if (proxyRes.headers['content-type']) {
        res.setHeader('Content-Type', proxyRes.headers['content-type']);
      }
      res.send(responseData);
    });
  });

  proxyReq.on('error', _err => {
    res.status(503).json({
      success: false,
      message: '监控模块不可用'
    });
  });

  proxyReq.setTimeout(30000, () => {
    proxyReq.destroy();
    res.status(504).json({
      success: false,
      message: '系统资源请求超时'
    });
  });

  proxyReq.end();
});

module.exports = router;
