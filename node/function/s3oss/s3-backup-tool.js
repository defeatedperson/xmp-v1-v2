const path = require('path')
const { readS3Config } = require('./s3-store')
const { createS3Client, testConnection } = require('./s3-client')

/**
 * 根据配置文件和 profileId 获取规范化后的 S3 Profile
 * - 若未找到对应 profile，则抛出错误
 * @param {number} profileId
 * @returns {{ id: number, name: string, endpoint: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string, pathStyle: boolean, useSSL: boolean, downloadExpireSeconds: number }}
 */
function getS3ProfileById(profileId) {
  const config = readS3Config()
  const list = Array.isArray(config && config.profiles) ? config.profiles : []
  const id = Number(profileId)
  const found = list.find(p => p && Number(p.id) === id)
  if (!found) {
    throw new Error('S3配置不存在')
  }
  return found
}

/**
 * 规范化任务名称，用于作为 S3 key 前缀的一部分
 * - 仅保留字母、数字、下划线和中划线
 * - 其它字符统一替换为下划线
 * @param {string} taskName
 * @returns {string}
 */
function sanitizeTaskName(taskName) {
  const raw = String(taskName || '').trim()
  if (!raw) return 'task'
  const normalized = raw.replace(/[^a-zA-Z0-9_\-\u4E00-\u9FFF]+/g, '_')
  const maxLen = 20
  const sliced = normalized.length > maxLen ? normalized.slice(0, maxLen) : normalized
  return sliced || 'task'
}

/**
 * 构造逻辑备份单元在对象存储中的 key 前缀
 * - 形式：schedule-backup/{safeTaskName}/
 * @param {string} taskName
 * @returns {string}
 */
function buildTaskPrefix(taskName) {
  const safeName = sanitizeTaskName(taskName)
  return `schedule-backup/${safeName}/`
}

/**
 * 从本地文件路径派生远端对象 key
 * - 形式：schedule-backup/{safeTaskName}/{fileName}
 * @param {string} taskName
 * @param {string} localFilePath
 * @returns {string}
 */
function buildObjectKeyFromLocal(taskName, localFilePath) {
  const prefix = buildTaskPrefix(taskName)
  const fileName = path.basename(localFilePath || '')
  return prefix + fileName
}

/**
 * 根据任务名称和远端文件名构造对象 key
 * - 下载或删除时使用
 * @param {string} taskName
 * @param {string} fileName
 * @returns {string}
 */
function buildObjectKeyFromFileName(taskName, fileName) {
  const prefix = buildTaskPrefix(taskName)
  const name = String(fileName || '').trim()
  return prefix + name
}

/**
 * 描述一次“逻辑备份单元”的对象集合
 * - 例如：一个压缩包 + 一个 JSON 元数据文件
 * @typedef {Object} BackupObjectDescriptor
 * @property {string} localPath 本地文件绝对路径
 * @property {string} objectKey 对象存储 key（不含 bucket）
 */

/**
 * 构造“逻辑备份单元”对应的多对象描述
 * - 约定：
 *   - 压缩包的本地路径由调用方提供
 *   - 若存在同目录下的 JSON 元数据文件，则一并作为第二个对象
 * @param {string} taskName
 * @param {string} archivePath 压缩包本地路径
 * @param {string|null|undefined} metaJsonPath JSON 元数据本地路径，可为空
 * @returns {BackupObjectDescriptor[]}
 */
function buildBackupObjectDescriptors(taskName, archivePath, metaJsonPath) {
  const list = []
  if (archivePath) {
    list.push({
      localPath: archivePath,
      objectKey: buildObjectKeyFromLocal(taskName, archivePath)
    })
  }
  if (metaJsonPath) {
    list.push({
      localPath: metaJsonPath,
      objectKey: buildObjectKeyFromLocal(taskName, metaJsonPath)
    })
  }
  return list
}

/**
 * 生成某个任务下所有备份对象的统一前缀，用于列举 / 清理
 * - 与 buildTaskPrefix 一致，单独暴露便于调用
 * @param {string} taskName
 * @returns {string}
 */
function getTaskObjectPrefix(taskName) {
  return buildTaskPrefix(taskName)
}

function createS3ContextByProfileId(profileId) {
  const profile = getS3ProfileById(profileId)
  const { client, bucket } = createS3Client(profile)
  return { profile, client, bucket }
}

async function createS3ContextWithTest(profileId) {
  const ctx = createS3ContextByProfileId(profileId)
  await testConnection(ctx.client, ctx.bucket)
  return ctx
}

module.exports = {
  getS3ProfileById,
  sanitizeTaskName,
  buildTaskPrefix,
  buildObjectKeyFromLocal,
  buildObjectKeyFromFileName,
  buildBackupObjectDescriptors,
  getTaskObjectPrefix,
  createS3ContextByProfileId,
  createS3ContextWithTest
}
