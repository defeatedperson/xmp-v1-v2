const express = require('express');
const router = express.Router();
const nodeTool = require('../function/node/dataTool');
const nodeCa = require('../function/node/node-ca');
const logger = require('../function/basic/log');

router.get('/api/node/list', async (req, res) => {
  try {
    const list = await nodeTool.getFullList();
    res.json({
      success: true,
      data: list
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: '获取节点列表失败',
      error: err.message
    });
  }
});

router.get('/api/node/type', async (req, res) => {
  try {
    const list = await nodeTool.getIdTypeRemarkList();
    res.json({
      success: true,
      data: list
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: '获取节点类型列表失败',
      error: err.message
    });
  }
});

router.post('/api/node/add', async (req, res) => {
  try {
    const { id, type, address, remark } = req.body || {};
    if (id === undefined || type === undefined || address === undefined) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数id、type或address'
      });
    }
    const record = await nodeTool.addNode(id, type, address, remark);
    await logger.info('节点管理', `新增节点: ${id} (${type})`);
    res.json({
      success: true,
      message: '节点添加成功',
      data: record
    });
  } catch (err) {
    const status = /id|类型|地址|备注/.test(err.message) ? 400 : 500;
    res.status(status).json({
      success: false,
      message: err.message
    });
  }
});

router.put('/api/node/update', async (req, res) => {
  try {
    const body = req.body || {};
    const { id } = body;
    if (id === undefined) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数id'
      });
    }

    let updated;
    if (typeof body.field === 'string' && Object.prototype.hasOwnProperty.call(body, 'value')) {
      updated = await nodeTool.updateNode(id, body.field, body.value);
      await logger.info('节点管理', `更新节点 ${id}: ${body.field} -> ${body.value}`);
    } else {
      const updates = {};
      if (Object.prototype.hasOwnProperty.call(body, 'remark')) updates.remark = body.remark;
      if (Object.prototype.hasOwnProperty.call(body, 'type')) updates.type = body.type;
      if (Object.prototype.hasOwnProperty.call(body, 'address')) updates.address = body.address;

      updated = await nodeTool.updateNode(id, updates);
      await logger.info('节点管理', `更新节点 ${id}: ${JSON.stringify(updates)}`);
    }

    res.json({
      success: true,
      message: '节点更新成功',
      data: updated
    });
  } catch (err) {
    const status = /未找到指定id的记录|没有提供可更新的字段|id必须为|地址|备注/.test(err.message) ? 400 : 500;
    res.status(status).json({
      success: false,
      message: err.message
    });
  }
});

router.delete('/api/node/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await nodeTool.deleteNode(id);
    await logger.info('节点管理', `删除节点: ${id}`);
    res.json({
      success: true,
      message: '节点删除成功'
    });
  } catch (err) {
    const status = /未找到指定id的记录|id必须为/.test(err.message) ? 400 : 500;
    res.status(status).json({
      success: false,
      message: err.message
    });
  }
});

router.get('/api/nodes/:id/address', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: '无效的节点ID'
      });
    }

    const address = await nodeTool.getAddressById(id);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: '节点不存在'
      });
    }

    res.json({
      success: true,
      data: {
        address: address
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: '获取节点地址失败',
      error: err.message
    });
  }
});

router.post('/api/node/:id/cert', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: '无效的节点ID'
      });
    }

    const cert = await nodeCa.getNodeCert(id);

    res.json({
      success: true,
      data: {
        nodeId: cert.nodeId,
        hostname: cert.hostname,
        caCert: cert.caCert,
        nodeCert: cert.nodeCert,
        nodeKey: cert.nodeKey
      }
    });
  } catch (err) {
    const status = err.message === '节点不存在' ? 404 : 500;
    res.status(status).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;
