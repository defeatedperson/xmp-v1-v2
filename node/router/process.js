const express = require('express');
const {
  getProcessList,
  searchProcesses,
  getProcessStats,
  getProcessedProcessData
} = require('../function/monitor/processMonitor');

const router = express.Router();

/**
 * 获取进程列表
 * GET /processes
 * 查询参数:
 * - search: 搜索关键词（进程名或PID）
 * - sortBy: 排序字段（cpu, memory, name, pid）
 * - sortOrder: 排序方式（asc, desc）
 */
router.get('/', async (req, res) => {
  try {
    const options = {
      search: req.query.search || '',
      sortBy: req.query.sortBy || 'cpu',
      sortOrder: req.query.sortOrder || 'desc'
    };

    const result = await getProcessedProcessData(options);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        timestamp: result.timestamp
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取进程列表失败',
      error: error.message
    });
  }
});

/**
 * 获取原始进程列表（无过滤排序）
 * GET /processes/raw
 */
router.get('/raw', async (req, res) => {
  try {
    const processes = await getProcessList();
    res.json({
      success: true,
      data: {
        processes,
        count: processes.length
      },
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取原始进程列表失败',
      error: error.message
    });
  }
});

/**
 * 获取进程统计信息
 * GET /processes/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const processes = await getProcessList();
    const stats = getProcessStats(processes);
    
    res.json({
      success: true,
      data: stats,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取进程统计信息失败',
      error: error.message
    });
  }
});

/**
 * 搜索进程
 * POST /processes/search
 * 请求体: { search: "关键词" }
 */
router.post('/search', async (req, res) => {
  try {
    const { search = '' } = req.body;
    
    if (!search || typeof search !== 'string') {
      return res.status(400).json({
        success: false,
        message: '搜索关键词不能为空'
      });
    }

    const processes = await getProcessList();
    const filteredProcesses = searchProcesses(processes, search);
    const stats = getProcessStats(filteredProcesses);
    
    res.json({
      success: true,
      data: {
        processes: filteredProcesses,
        stats,
        searchTerm: search,
        originalCount: processes.length,
        filteredCount: filteredProcesses.length
      },
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '搜索进程失败',
      error: error.message
    });
  }
});

module.exports = router;