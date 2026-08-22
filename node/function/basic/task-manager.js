const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

class TaskManager {
  constructor(options = {}) {
    this.tasksDir = options.tasksDir || path.join(os.tmpdir(), 'xmp-tasks')
    this.tasks = new Map()
    this.logger = options.logger || console
    try {
      if (!fs.existsSync(this.tasksDir)) {
        fs.mkdirSync(this.tasksDir, { recursive: true })
      }
    } catch (error) {
      this.logger.warn(`无法创建临时任务目录 ${this.tasksDir}:`, error.message)
      this.tasksDir = path.join(process.cwd(), 'tmp', 'tasks')
      if (!fs.existsSync(this.tasksDir)) {
        fs.mkdirSync(this.tasksDir, { recursive: true })
      }
    }
    this.loadExistingTasks()
    this.resetRunningTasksOnStartup()
    setImmediate(() => {
      this.cleanupExpiredTasks()
    })
    setInterval(() => {
      this.cleanupExpiredTasks()
    }, 60 * 60 * 1000)
  }

  loadExistingTasks() {
    try {
      if (!fs.existsSync(this.tasksDir)) return
      const files = fs.readdirSync(this.tasksDir)
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const taskData = JSON.parse(fs.readFileSync(path.join(this.tasksDir, file), 'utf8'))
            this.tasks.set(taskData.id, taskData)
          } catch (error) {
            this.logger.error(`加载任务失败: ${file}`, error)
          }
        }
      })
      this.logger.log(`已加载 ${this.tasks.size} 个任务`)
    } catch (error) {
      this.logger.error('加载任务失败:', error)
    }
  }

  resetRunningTasksOnStartup() {
    let updated = 0
    const now = new Date().toISOString()
    for (const task of this.tasks.values()) {
      if (!task) continue
      if (task.status === 'running' || task.status === 'pending') {
        task.status = 'failed'
        task.message = '任务在服务重启时中止'
        if (typeof task.progress !== 'number' || !Number.isFinite(task.progress)) {
          task.progress = 0
        }
        task.updatedAt = now
        this.saveTask(task.id)
        updated++
      }
    }
    if (updated > 0) {
      this.logger.log(`服务启动时将 ${updated} 个运行中/待执行任务标记为失败`)
    }
  }

  createTask(type, data) {
    const taskId = crypto.randomUUID()
    const now = new Date().toISOString()
    const task = {
      id: taskId,
      type,
      data,
      status: 'pending',
      progress: 0,
      message: '',
      logs: [],
      createdAt: now,
      updatedAt: now
    }
    this.tasks.set(taskId, task)
    this.saveTask(taskId)
    this.logger.log(`创建任务: ${taskId}, 类型: ${type}`)
    return taskId
  }

  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId)
    if (!task) {
      this.logger.error(`任务不存在: ${taskId}`)
      return
    }
    Object.assign(task, updates)
    task.updatedAt = new Date().toISOString()
    this.tasks.set(taskId, task)
    this.saveTask(taskId)
  }

  addTaskLog(taskId, message) {
    const task = this.tasks.get(taskId)
    if (!task) {
      this.logger.error(`任务不存在: ${taskId}`)
      return
    }
    const timestamp = new Date().toISOString()
    task.logs.push({ timestamp, message })
    task.updatedAt = timestamp
    if (task.logs.length > 1000) {
      task.logs = task.logs.slice(-500)
    }
    this.tasks.set(taskId, task)
    this.saveTask(taskId)
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || null
  }

  getAllTasks(type = null) {
    const tasks = Array.from(this.tasks.values())
    if (type) return tasks.filter(task => task.type === type)
    return tasks
  }

  deleteTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return false
    this.tasks.delete(taskId)
    try {
      const taskFile = path.join(this.tasksDir, `${taskId}.json`)
      if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile)
      return true
    } catch (error) {
      this.logger.error(`删除任务文件失败: ${taskId}`, error)
      return false
    }
  }

  saveTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return
    try {
      const taskFile = path.join(this.tasksDir, `${taskId}.json`)
      fs.writeFileSync(taskFile, JSON.stringify(task, null, 2))
    } catch (error) {
      this.logger.error(`保存任务失败: ${taskId}`, error)
    }
  }

  cleanupExpiredTasks(maxAgeHours = 12) {
    const cutoff = Date.now() - maxAgeHours * 3600000
    const removableStatuses = new Set(['completed', 'failed'])
    let removed = 0
    for (const task of this.tasks.values()) {
      if (!removableStatuses.has(task.status)) continue
      const t = new Date(task.updatedAt).getTime()
      if (!Number.isFinite(t)) continue
      if (t < cutoff) {
        if (this.deleteTask(task.id)) removed++
      }
    }
    if (removed > 0) {
      this.logger.log(`清理过期任务: ${removed}`)
    }
  }

  async executeTask(taskId, taskFunction) {
    const task = this.tasks.get(taskId)
    if (!task) {
      this.logger.error(`任务不存在: ${taskId}`)
      return
    }
    if (task.status !== 'pending') {
      this.logger.warn(`任务状态非待执行，忽略执行请求: ${taskId}, status=${task.status}`)
      return
    }
    try {
      this.updateTask(taskId, { status: 'running', message: '任务开始执行' })
      await taskFunction(taskId, (progress, message) => {
        this.updateTask(taskId, { progress, message })
      }, (logMessage) => {
        this.addTaskLog(taskId, logMessage)
      })
      this.updateTask(taskId, { status: 'completed', progress: 100, message: '任务执行完成' })
      this.logger.log(`任务执行完成: ${taskId}`)
    } catch (error) {
      this.updateTask(taskId, { status: 'failed', message: `任务执行失败: ${error.message}` })
      this.addTaskLog(taskId, `错误: ${error.message}`)
      this.logger.error(`任务执行失败: ${taskId}`, error)
    }
  }
}

const taskManager = new TaskManager()

module.exports = { TaskManager, taskManager }
