const express = require('express')
const router = express.Router()
const { readSchedulePlan, writeSchedulePlan } = require('../function/schedule/plan-store')
const log = require('../function/basic/log')
const { readS3Config, writeS3Config } = require('../function/s3oss/s3-store')
const { getScheduleLogs } = require('../function/schedule/log-store')
const { createS3ContextByProfileId, buildObjectKeyFromFileName } = require('../function/s3oss/s3-backup-tool')
const { createPresignedUrl } = require('../function/s3oss/s3-client')
const { runScheduleSlotForNow } = require('../function/schedule/runner')

router.get('/schedule/plan', async (_req, res) => {
  try {
    const plan = readSchedulePlan()
    res.json({ success: true, data: plan })
  } catch (error) {
    res.status(500).json({ success: false, message: '读取计划任务配置失败', error: String(error && error.message || error) })
  }
})

router.post('/schedule/plan', async (req, res) => {
  try {
    const body = req.body || {}
    writeSchedulePlan(body)
    const plan = readSchedulePlan()
    res.json({ success: true, message: '计划任务配置已保存', data: plan })
  } catch (error) {
    res.status(500).json({ success: false, message: '写入计划任务配置失败', error: String(error && error.message || error) })
  }
})

router.get('/schedule/s3', async (_req, res) => {
  try {
    const config = readS3Config()
    res.json({ success: true, data: config })
  } catch (error) {
    res.status(500).json({ success: false, message: '读取S3配置失败', error: String(error && error.message || error) })
  }
})

router.post('/schedule/s3', async (req, res) => {
  try {
    const body = req.body || {}
    writeS3Config(body)
    const config = readS3Config()
    res.json({ success: true, message: 'S3配置已保存', data: config })
  } catch (error) {
    res.status(500).json({ success: false, message: '写入S3配置失败', error: String(error && error.message || error) })
  }
})

router.get('/schedule/logs', async (req, res) => {
  try {
    const daysRaw = req.query && req.query.days
    const limitRaw = req.query && req.query.limit
    const days = Number(daysRaw || 3)
    const limit = Number(limitRaw || 100)
    const logs = await getScheduleLogs({ days, limit })
    res.json({ success: true, data: logs })
  } catch (error) {
    res.status(500).json({ success: false, message: '获取计划任务日志失败', error: String(error && error.message || error) })
  }
})

router.post('/schedule/s3/download-url', async (req, res) => {
  try {
    const body = req.body || {}
    const profileIdRaw = body.profileId
    const taskNameRaw = body.taskName
    const fileNameRaw = body.fileName
    const expireRaw = body.expireSeconds
    const profileId = Number(profileIdRaw)
    const taskName = String(taskNameRaw || '').trim()
    const fileName = String(fileNameRaw || '').trim()
    if (!Number.isFinite(profileId) || profileId <= 0) {
      return res.status(400).json({ success: false, message: '无效的S3配置ID' })
    }
    if (!taskName) {
      return res.status(400).json({ success: false, message: '任务名称不能为空' })
    }
    if (!fileName) {
      return res.status(400).json({ success: false, message: '文件名不能为空' })
    }
    const ctx = createS3ContextByProfileId(profileId)
    const objectKey = buildObjectKeyFromFileName(taskName, fileName)
    const expireSeconds = Number(expireRaw || ctx.profile && ctx.profile.downloadExpireSeconds || 3600)
    const url = await createPresignedUrl(ctx.client, ctx.bucket, objectKey, expireSeconds)
    res.json({ success: true, data: { url, bucket: ctx.bucket, key: objectKey, expireSeconds } })
  } catch (error) {
    res.status(500).json({ success: false, message: '生成下载链接失败', error: String(error && error.message || error) })
  }
})

router.post('/schedule/run', async (_req, res) => {
  try {
    runScheduleSlotForNow().catch(error => {
      const msg = String(error && error.message || error || 'error')
      log.error('手动执行计划任务', msg).catch(() => {})
    })
    res.json({ success: true, message: '当前时间槽计划任务已触发执行' })
  } catch (error) {
    res.status(500).json({ success: false, message: '手动触发计划任务失败', error: String(error && error.message || error) })
  }
})

module.exports = router
