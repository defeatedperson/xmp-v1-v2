const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getPath } = require('../config/paths');
const { selfSignCert } = require('../function/basic/selfSignCert');
const { updateDockerStore, updateCustomStore, readCustomStore, ensureCustomStoreExists } = require('../function/basic/appsore');

// 默认路由
router.get('/api', (_req, res) => {
  res.json({ message: 'xmp-master-api is ok' });
});

router.get('/api/appstore/docker-store', (_req, res) => {
  try {
    const p = getPath('data', 'appstore', 'docker-store.json');
    if (!fs.existsSync(p)) {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const defaultData = {
        "version": "1.0",
        "types": [
          { "id": "1", "name": "请更新应用商店" },
          { "id": "2", "name": "在设置当中可以更新" }
        ],
        "apps": [
          {
            "name": "MySQL",
            "description": "关系型数据库 MySQL 8.4",
            "typeId": "2",
            "versions": [
              {
                "version": "8.4.7",
                "image": "mysql:8.4.7",
                "network": "bridge",
                "command": "",
                "containerName": "mysql8",
                "portclock": true,
                "ports": [
                  { "host": "3306", "container": "3306" }
                ],
                "volumes": [
                  { "host": "/srv/mysql/data", "container": "/var/lib/mysql" },
                  { "host": "/srv/mysql/conf.d", "container": "/etc/mysql/conf.d" },
                  { "host": "/srv/mysql/logs", "container": "/var/log/mysql" },
                  { "host": "/backup", "container": "/backup" }
                ],
                "env": [
                  { "name": "MYSQL_ROOT_PASSWORD", "value": "your-strong-password" },
                  { "name": "TZ", "value": "Asia/Shanghai" }
                ]
              }
            ]
          },
          {
            "name": "Redis",
            "description": "内存数据库 Redis 8.4.0",
            "typeId": "2",
            "versions": [
              {
                "version": "8.4.0",
                "image": "redis:8.4.0",
                "network": "bridge",
                "command": "redis-server /usr/local/etc/redis/redis.conf",
                "containerName": "redis",
                "portclock": true,
                "ports": [
                  { "host": "6379", "container": "6379" }
                ],
                "volumes": [
                  { "host": "/srv/redis/data", "container": "/data" },
                  { "host": "/srv/redis/conf/redis.conf", "container": "/usr/local/etc/redis/redis.conf", "type": "file" }
                ],
                "env": [
                  { "name": "TZ", "value": "Asia/Shanghai" }
                ]
              }
            ]
          },
          {
            "name": "OpenResty",
            "description": "OpenResty Web 服务器",
            "typeId": "2",
            "versions": [
              {
                "version": "1.0.0",
                "image": "defeatedperson/openresty:v1.0.0",
                "network": "host",
                "command": "",
                "containerName": "openresty",
                "ports": [],
                "volumes": [
                  { "host": "/acme", "container": "/www/acme-data" },
                  { "host": "/conf", "container": "/www/conf" },
                  { "host": "/certs", "container": "/www/certs" },
                  { "host": "/web_log", "container": "/www/web_log" },
                  { "host": "/website", "container": "/www/website" },
                  { "host": "/web-rules", "container": "/www/web-rules" },
                  { "host": "/cache", "container": "/www/cache" }
                ],
                "env": []
              },
              {
                "version": "1.0.1",
                "image": "defeatedperson/openresty:v1.0.1",
                "network": "host",
                "command": "",
                "containerName": "openresty",
                "ports": [],
                "volumes": [
                  { "host": "/acme", "container": "/www/acme-data" },
                  { "host": "/conf", "container": "/www/conf" },
                  { "host": "/certs", "container": "/www/certs" },
                  { "host": "/web_log", "container": "/www/web_log" },
                  { "host": "/website", "container": "/www/website" },
                  { "host": "/web-rules", "container": "/www/web-rules" },
                  { "host": "/cache", "container": "/www/cache" }
                ],
                "env": []
              }
            ]
          }
        ]
      };
      fs.writeFileSync(p, JSON.stringify(defaultData, null, 2), 'utf8');
    }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '读取docker-store失败', error: error.message });
  }
});

router.post('/api/website/ssl/self-sign', async (req, res) => {
  try {
    const { domains, days, certName, remark } = req.body || {}
    const data = await selfSignCert({ domains, days, certName })
    if (remark) data.remark = String(remark)
    res.json({ success: true, data })
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || '生成自签证书失败' });
  }
});

router.post('/api/appstore/docker-store', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ success: false, message: '缺少data参数' });
    }
    const result = updateDockerStore(data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: '更新docker-store失败', error: error.message });
  }
});

router.get('/api/appstore/custom-store', (req, res) => {
  try {
    const data = readCustomStore();
    res.json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

router.post('/api/appstore/custom-store', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ success: false, message: '缺少data参数' });
    }
    ensureCustomStoreExists();
    const result = updateCustomStore(data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: '更新custom-store失败', error: error.message });
  }
});

module.exports = router;
