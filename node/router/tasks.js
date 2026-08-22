const express = require('express')
const router = express.Router()
const { taskManager } = require('../function/basic/task-manager')
const log = require('../function/basic/log')
const { isValidTaskId } = require('../function/basic/task-id')

router.get('/', async (req, res) => {
  try {
    const { type } = req.query
    const t = typeof type === 'string' ? type : undefined
    if (t && (!/^[A-Za-z0-9_.-]{1,64}$/.test(t))) {
      log.warning('获取任务列表', '任务类型不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '任务类型不合法' })
    }
    const tasks = taskManager.getAllTasks(t)
    res.json({ success: true, data: tasks })
  } catch (error) {
    log.error('获取任务列表', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({ success: false, message: '获取任务列表失败', error: error.message })
  }
})

router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    if (!isValidTaskId(taskId)) {
      log.warning('获取任务状态', '任务ID不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '任务ID不合法' })
    }
    const task = taskManager.getTask(taskId)
    if (!task) {
      log.warning('获取任务状态', '任务不存在').catch(() => {})
      return res.status(404).json({ success: false, message: '任务不存在' })
    }
    res.json({ success: true, data: task })
  } catch (error) {
    log.error('获取任务状态', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({ success: false, message: '获取任务状态失败', error: error.message })
  }
})

router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    if (!isValidTaskId(taskId)) {
      log.warning('删除任务', '任务ID不合法').catch(() => {})
      return res.status(400).json({ success: false, message: '任务ID不合法' })
    }
    const result = taskManager.deleteTask(taskId)
    if (!result) {
      return res.status(404).json({ success: false, message: '任务不存在或已结束' })
    }
    log.info('删除任务', JSON.stringify({ taskId })).catch(() => {})
    res.json({ success: true, message: '任务删除成功' })
  } catch (error) {
    log.error('删除任务', String(error && error.message || 'error')).catch(() => {})
    res.status(500).json({ success: false, message: '删除任务失败', error: error.message })
  }
})

module.exports = router
