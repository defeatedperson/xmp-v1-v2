const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { getPath } = require('../../config/paths');
const { readSchedulePlan } = require('./plan-store');
const log = require('../basic/log');
const { createDaemonClient } = require('../basic/daemon-client');
const { taskManager } = require('../basic/task-manager');
const { websiteBackupManager, backupManager } = require('../backup');
const { createDatabaseBackupAsync, listSelfBackups, resolveSelfDir } = require('../mysql/backup');
const { dockerManager } = require('../docker');
const { sanitizeTaskName, buildObjectKeyFromLocal } = require('../s3oss/s3-backup-tool');
const { createS3UploadBackupTask } = require('../s3oss/s3-upload-task');

/**
 * 计划任务调度器
 *
 * 职责：
 * - 每 2 小时对齐到固定时间槽（0/2/4/.../22 点）触发一次
 * - 使用 data/schedule/runner.lock 文件作为“上一槽是否完成”的标记
 * - 若发现上一槽未释放锁，则触发守护进程重启自身并跳过本轮
 * - 正常情况下读取 plan.json，按当前槽位依次执行任务块
 * - 每个任务块执行后写入一条 schedule 类型的系统日志
 *
 * 注意：
 * - 本模块仅提供调度能力，实际备份执行与保留策略后续接入
 * - 需要在 server.js 中显式调用 startScheduleRunner() 才会生效
 */

function ensureScheduleDir() {
  const dir = getPath('data', 'schedule');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getLockFilePath() {
  const dir = ensureScheduleDir();
  return path.join(dir, 'runner.lock');
}

function getCurrentSlotHour(date = new Date()) {
  const h = date.getHours();
  return Math.floor(h / 2) * 2;
}

function calculateFirstDelay(now = new Date()) {
  const base = new Date(now.getTime());
  base.setMinutes(0, 0, 0);
  const h = base.getHours();
  const nextEven = h % 2 === 0 ? h + 2 : h + 1;
  base.setHours(nextEven);
  return base.getTime() - now.getTime();
}

async function writeScheduleLog(title, payload) {
  const content = payload && typeof payload === 'object' ? JSON.stringify(payload) : String(payload || '');
  try {
    await log.write('schedule', title, content);
  } catch {}
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitTaskCompletion(taskId, options = {}) {
  const pollIntervalMs = typeof options.pollIntervalMs === 'number' && options.pollIntervalMs > 0 ? options.pollIntervalMs : 30000;
  const maxWaitMs = typeof options.maxWaitMs === 'number' && options.maxWaitMs > 0 ? options.maxWaitMs : 2 * 60 * 60 * 1000;
  const startedAt = Date.now();
  for (;;) {
    const task = taskManager.getTask(taskId);
    if (!task) {
      return { status: 'missing', task: null };
    }
    if (task.status === 'completed' || task.status === 'failed') {
      return { status: task.status, task };
    }
    if (Date.now() - startedAt > maxWaitMs) {
      return { status: 'timeout', task };
    }
    await sleep(pollIntervalMs);
  }
}

/**
 * 解析任务块中的远端备份配置
 * - remoteProfileId 和 remoteCopies 同时为有效值时才启用远端备份
 */
function getRemoteBackupOptions(task) {
  const profileRaw = task && task.remoteProfileId;
  const copiesRaw = task && task.remoteCopies;
  const profileId = Number(profileRaw);
  const remoteCopies = Number(copiesRaw);
  const enabled = Number.isFinite(profileId) && profileId > 0 && Number.isFinite(remoteCopies) && remoteCopies > 0;
  if (!enabled) {
    return { enabled: false, profileId: 0, remoteCopies: 0 };
  }
  return { enabled: true, profileId, remoteCopies };
}

/**
 * 针对单个本地备份文件执行一次 S3 上传任务
 * - 根据任务块名称构造逻辑任务名，用于生成统一的对象前缀
 * - 返回 S3 上传任务的执行摘要，便于上层决定最终状态
 */
async function uploadBackupToS3IfNeeded(task, localPath, defaultTaskName) {
  const opts = getRemoteBackupOptions(task);
  if (!opts.enabled) return null;
  if (!localPath) {
    throw new Error('未找到本地备份文件路径，无法上传到对象存储');
  }
  const rawName = String(task && task.name || '').trim() || String(defaultTaskName || '').trim() || 'schedule-backup';
  const taskName = sanitizeTaskName(rawName);
  const objectKey = buildObjectKeyFromLocal(taskName, localPath);
  const data = {
    profileId: opts.profileId,
    taskName,
    objects: [
      {
        localPath,
        objectKey
      }
    ],
    remoteCopies: opts.remoteCopies,
    deleteLocalAfterUpload: false
  };
  const s3TaskId = createS3UploadBackupTask(data);
  const result = await waitTaskCompletion(s3TaskId, {});
  const taskInfo = result.task || {};
  const s3Result = taskInfo.result || null;
  const success = result.status === 'completed' && (!s3Result || s3Result.success !== false);
  return {
    taskId: s3TaskId,
    taskInfo,
    resultStatus: result.status,
    success
  };
}

async function handleExistingLock(slotHour) {
  const lockPath = getLockFilePath();
  let lockContent = null;
  try {
    const txt = await fsp.readFile(lockPath, 'utf8');
    lockContent = txt || null;
  } catch {
    lockContent = null;
  }
  try {
    await fsp.unlink(lockPath);
  } catch {}

  const detectedAt = new Date().toISOString();
  await writeScheduleLog('检测到上一时间槽计划任务未完成，准备触发重启', {
    slotHour,
    detectedAt,
    lockRaw: lockContent
  });

  try {
    const service = process.env.DAEMON_SERVICE || 'node-agent';
    const client = createDaemonClient({ service });
    const ok = await client.restartSelf();
    await writeScheduleLog('计划任务已请求守护进程重启本服务', {
      slotHour,
      detectedAt,
      service,
      requested: ok
    });
  } catch (error) {
    await writeScheduleLog('计划任务触发守护进程重启失败', {
      slotHour,
      detectedAt,
      error: String(error && error.message || error)
    });
  }
}

async function runScheduleSlotForNow() {
  const now = new Date();
  const slotHour = getCurrentSlotHour(now);
  await runScheduleSlot(slotHour, now);
}

async function runScheduleSlot(slotHour, now = new Date()) {
  const lockPath = getLockFilePath();
  if (fs.existsSync(lockPath)) {
    await handleExistingLock(slotHour);
    return;
  }

  const startedAt = now.toISOString();
  const lockPayload = {
    slotHour,
    startedAt
  };
  try {
    await fsp.writeFile(lockPath, JSON.stringify(lockPayload), 'utf8');
  } catch (error) {
    await writeScheduleLog('写入计划任务锁文件失败，跳过本轮执行', {
      slotHour,
      startedAt,
      error: String(error && error.message || error)
    });
    return;
  }

  let plan;
  try {
    plan = readSchedulePlan();
  } catch (error) {
    await writeScheduleLog('读取计划任务配置失败，跳过本轮执行', {
      slotHour,
      startedAt,
      error: String(error && error.message || error)
    });
    try {
      await fsp.unlink(lockPath);
    } catch {}
    return;
  }

  if (!plan || plan.enabled === false) {
    try {
      await fsp.unlink(lockPath);
    } catch {}
    return;
  }

  const list = plan.slots && plan.slots.hasOwnProperty(String(slotHour)) ? plan.slots[String(slotHour)] : [];
  const tasks = Array.isArray(list) ? list : [];
  if (!tasks.length) {
    try {
      await fsp.unlink(lockPath);
    } catch {}
    return;
  }

  for (const task of tasks) {
    await executeTaskBlock(slotHour, task);
  }

  try {
    await fsp.unlink(lockPath);
  } catch {}
}

function buildScheduleBackupPrefix(type, target, taskId) {
  const t = String(type || '').trim() || 'unknown';
  const shortType = t === 'website' ? 'web' : (t === 'database' ? 'db' : (t === 'app' || t === 'container' ? 'app' : 'other'));
  const safeTarget = String(target || '').trim() || 'unknown';
  const safeId = String(taskId || '').trim() || '0';
  return `sched-${shortType}-${safeTarget}-${safeId}-`;
}

async function executeWebsiteBackup(task, scheduleTaskId) {
  const target = task && task.target;
  const remoteOptions = getRemoteBackupOptions(task);
  const localRaw = Number(task && task.localCopies || 0);
  const localCopies = localRaw > 0 ? localRaw : (remoteOptions.enabled ? 1 : 0);
  if (!target) {
    throw new Error('缺少网站目标');
  }
  const prefix = buildScheduleBackupPrefix('website', target, scheduleTaskId);
  const stamp = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 14);
  const backupName = `${prefix}${stamp}`;
  const taskId = await websiteBackupManager.createBackupAsync(target, backupName);
  const result = await waitTaskCompletion(taskId, {});
  const taskInfo = result.task || {};
  const backupResult = taskInfo.result || null;
  const success = result.status === 'completed' && (!backupResult || backupResult.success !== false);
  let remote = null;
  if (success && localCopies > 0) {
    try {
      const all = await websiteBackupManager.listBackups(target);
      const filtered = Array.isArray(all) ? all.filter(x => x && typeof x.name === 'string' && x.name.startsWith('sched-')) : [];
      const toRemove = filtered.slice(localCopies);
      for (const item of toRemove) {
        try {
          await websiteBackupManager.deleteBackup(target, item.name);
        } catch {}
      }
    } catch {}
  }
  if (success) {
    const data = backupResult && backupResult.data;
    const backupFile = data && data.backupFile;
    if (backupFile) {
      const backupDir = typeof websiteBackupManager.resolveBackupDir === 'function'
        ? websiteBackupManager.resolveBackupDir(target)
        : getPath('data', 'www', 'backup', target);
      const localPath = path.join(backupDir, backupFile);
      const defaultTaskName = `website-${target}-${scheduleTaskId || ''}`;
      remote = await uploadBackupToS3IfNeeded(task, localPath, defaultTaskName);
    }
  }
  const finalSuccess = success && (!remote || remote.success !== false);
  const resultStatus = finalSuccess ? result.status : ((remote && remote.resultStatus) || result.status);
  return { taskId, taskInfo, resultStatus, success: finalSuccess, remote };
}

async function resolveContainerIdByName(name) {
  const list = await dockerManager.listContainers(true);
  const safe = String(name || '').trim();
  const found = Array.isArray(list) ? list.find(c => c && c.name === safe) : null;
  if (!found || !found.containerId) {
    throw new Error('容器不存在');
  }
  return found.containerId;
}

async function executeContainerBackup(task, scheduleTaskId) {
  const target = task && task.target;
  const remoteOptions = getRemoteBackupOptions(task);
  const localRaw = Number(task && task.localCopies || 0);
  const localCopies = localRaw > 0 ? localRaw : (remoteOptions.enabled ? 1 : 0);
  if (!target) {
    throw new Error('缺少容器目标');
  }
  const containerId = await resolveContainerIdByName(target);
  const prefix = buildScheduleBackupPrefix('app', target, scheduleTaskId);
  const stamp = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 14);
  const backupName = `${prefix}${stamp}`;
  const taskId = await backupManager.createBackupAsync(containerId, backupName);
  const result = await waitTaskCompletion(taskId, {});
  const taskInfo = result.task || {};
  const backupResult = taskInfo.result || null;
  const success = result.status === 'completed' && (!backupResult || backupResult.success !== false);
  let remote = null;
  if (success && localCopies > 0) {
    try {
      const all = await backupManager.listBackups(target);
      const filtered = Array.isArray(all) ? all.filter(x => typeof x === 'string' && x.startsWith('sched-')).sort().reverse() : [];
      const toRemove = filtered.slice(localCopies);
      for (const name of toRemove) {
        try {
          await backupManager.deleteBackup(target, name);
        } catch {}
      }
    } catch {}
  }
  if (success) {
    const data = backupResult && backupResult.data;
    const dir = data && data.dir;
    if (dir) {
      const localPath = path.join(dir, 'data.tgz');
      const defaultTaskName = `app-${target}-${scheduleTaskId || ''}`;
      remote = await uploadBackupToS3IfNeeded(task, localPath, defaultTaskName);
    }
  }
  const finalSuccess = success && (!remote || remote.success !== false);
  const resultStatus = finalSuccess ? result.status : ((remote && remote.resultStatus) || result.status);
  return { taskId, taskInfo, resultStatus, success: finalSuccess, remote };
}

async function executeDatabaseBackup(task, scheduleTaskId) {
  const target = task && task.target;
  const remoteOptions = getRemoteBackupOptions(task);
  const localRaw = Number(task && task.localCopies || 0);
  const localCopies = localRaw > 0 ? localRaw : (remoteOptions.enabled ? 1 : 0);
  if (!target) {
    throw new Error('缺少数据库目标');
  }
  const prefix = buildScheduleBackupPrefix('database', target, scheduleTaskId);
  const taskId = await createDatabaseBackupAsync(target, prefix);
  const result = await waitTaskCompletion(taskId, {});
  const taskInfo = result.task || {};
  const backupResult = taskInfo.result || null;
  const success = result.status === 'completed' && (!backupResult || backupResult.success !== false);
  let remote = null;
  if (success && localCopies > 0) {
    try {
      const list = await listSelfBackups(target);
      const filtered = Array.isArray(list) ? list.filter(x => x && typeof x.name === 'string' && x.name.startsWith('sched-')) : [];
      const toRemove = filtered.slice(localCopies);
      const dir = await resolveSelfDir(target);
      for (const item of toRemove) {
        try {
          const filePath = path.join(dir, item.name);
          await fsp.unlink(filePath);
        } catch {}
      }
    } catch {}
  }
  if (success) {
    const data = backupResult && backupResult.data;
    const fileName = data && data.fileName;
    const dir = data && data.dir;
    if (fileName && dir) {
      const localPath = path.join(dir, fileName);
      const defaultTaskName = `db-${target}-${scheduleTaskId || ''}`;
      remote = await uploadBackupToS3IfNeeded(task, localPath, defaultTaskName);
    }
  }
  const finalSuccess = success && (!remote || remote.success !== false);
  const resultStatus = finalSuccess ? result.status : ((remote && remote.resultStatus) || result.status);
  return { taskId, taskInfo, resultStatus, success: finalSuccess, remote };
}

async function executeTaskBlock(slotHour, task) {
  const startedAt = new Date().toISOString();
  const payload = {
    slotHour,
    startedAt,
    finishedAt: null,
    taskId: task && task.id,
    taskName: task && task.name,
    type: task && task.type,
    target: task && task.target,
    localCopies: task && task.localCopies,
    remoteCopies: task && task.remoteCopies,
    remoteProfileId: task && task.remoteProfileId,
    status: 'pending',
    detail: ''
  };
  let summary = null;
  try {
    const type = String(task && task.type || '').trim();
    if (!type) {
      payload.status = 'skipped';
      payload.detail = '任务类型为空';
    } else if (type === 'website') {
      summary = await executeWebsiteBackup(task, task && task.id);
    } else if (type === 'app' || type === 'container') {
      summary = await executeContainerBackup(task, task && task.id);
    } else if (type === 'database') {
      summary = await executeDatabaseBackup(task, task && task.id);
    } else {
      payload.status = 'skipped';
      payload.detail = '不支持的任务类型';
    }
    if (summary) {
      payload.status = summary.success ? 'success' : (summary.resultStatus || 'failed');
      payload.detail = summary.success ? '备份完成' : `备份失败或未完成: ${summary.resultStatus}`;
    }
  } catch (error) {
    payload.status = 'failed';
    payload.detail = String(error && error.message || error);
  }
  try {
    payload.finishedAt = new Date().toISOString();
    await writeScheduleLog('计划任务执行结果', payload);
  } catch {}
}

function startScheduleRunner(options = {}) {
  const logger = options.logger || console;
  const intervalMs = 2 * 60 * 60 * 1000;
  const now = new Date();
  const firstDelay = calculateFirstDelay(now);
  const firstTarget = new Date(now.getTime() + firstDelay);

  logger.log('[schedule] 计划任务调度器已启动');
  logger.log('[schedule] 首次对齐时间:', firstTarget.toISOString());
  logger.log('[schedule] 首次对齐仅用于启动定时器，不执行计划任务');

  const timer = setTimeout(() => {
    let started = false;
    const interval = setInterval(() => {
      if (!started) {
        started = true;
        return;
      }
      runScheduleSlotForNow().catch(error => {
        logger.error('[schedule] 执行计划任务失败:', error && error.message ? error.message : error);
      });
    }, intervalMs);
    if (typeof interval.unref === 'function') interval.unref();
  }, firstDelay);

  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = {
  startScheduleRunner,
  runScheduleSlotForNow,
  runScheduleSlot
};
