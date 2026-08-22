const fs = require('fs');
const path = require('path');
const { getPath } = require('../../config/paths');

/**
 * 获取S3配置文件的完整路径
 * data/schedule/s3.json
 * @returns {string}
 */
function getS3ConfigFilePath() {
  const dir = getPath('data', 'schedule');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 's3.json');
}

/**
 * 读取S3配置文件
 * - 文件不存在时自动创建默认结构
 * - 文件为空或格式错误时返回默认结构
 * @returns {{ version: number, profiles: Array<{ id: number, name: string, endpoint: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string, pathStyle: boolean, useSSL: boolean, downloadExpireSeconds: number }> }}
 */
function readS3Config() {
  const file = getS3ConfigFilePath();
  if (!fs.existsSync(file)) {
    const defaultConfig = createDefaultConfig();
    writeS3Config(defaultConfig);
    return defaultConfig;
  }
  const txt = fs.readFileSync(file, 'utf8');
  if (!txt.trim()) {
    const defaultConfig = createDefaultConfig();
    writeS3Config(defaultConfig);
    return defaultConfig;
  }
  try {
    const data = JSON.parse(txt);
    if (!data || typeof data !== 'object') {
      throw new Error('config is not an object');
    }
    if (!data.profiles || !Array.isArray(data.profiles)) {
      throw new Error('config.profiles is invalid');
    }
    return data;
  } catch {
    const defaultConfig = createDefaultConfig();
    writeS3Config(defaultConfig);
    return defaultConfig;
  }
}

/**
 * 覆盖写入S3配置文件
 * @param {{ version: number, profiles: Array<{ id: number, name: string, endpoint: string, region?: string, bucket?: string, accessKeyId: string, secretAccessKey: string, pathStyle?: boolean, useSSL?: boolean, downloadExpireSeconds?: number }> }} config
 */
function writeS3Config(config) {
  const file = getS3ConfigFilePath();
  const tmp = file + '.tmp';
  const payload = {
    version: Number(config && config.version !== undefined ? config.version : 1),
    profiles: normalizeProfiles(config && config.profiles)
  };
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * 创建默认的S3配置结构
 * @returns {{ version: number, profiles: Array<any> }}
 */
function createDefaultConfig() {
  return {
    version: 1,
    profiles: []
  };
}

/**
 * 规范化 profiles 结构，确保每个 profile 都有必要的字段
 * @param {Array<any>|undefined} source
 * @returns {Array<{ id: number, name: string, endpoint: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string, pathStyle: boolean, useSSL: boolean, downloadExpireSeconds: number }>}
 */
function normalizeProfiles(source) {
  if (!Array.isArray(source)) {
    return [];
  }
  
  return source
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const id = Number(item.id) || index + 1;
      const name = String(item.name || 'profile_' + (index + 1));
      const endpoint = String(item.endpoint || 'https://s3.example.com');
      const region = item.region !== undefined ? String(item.region || '') : '';
      const bucket = item.bucket !== undefined ? String(item.bucket || '') : 'your-bucket-name';
      const accessKeyId = String(item.accessKeyId || 'YOUR_ACCESS_KEY_ID');
      const secretAccessKey = String(item.secretAccessKey || 'YOUR_SECRET_ACCESS_KEY');
      const pathStyle = item.pathStyle !== undefined ? Boolean(item.pathStyle) : false;
      const useSSL = item.useSSL !== undefined ? Boolean(item.useSSL) : true;
      const downloadExpireSecondsRaw = item.downloadExpireSeconds;
      let downloadExpireSeconds = Number(downloadExpireSecondsRaw);
      if (!Number.isFinite(downloadExpireSeconds) || downloadExpireSeconds <= 0) {
        downloadExpireSeconds = 3600;
      }
      return {
        id,
        name,
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey,
        pathStyle,
        useSSL,
        downloadExpireSeconds
      };
    });
}

module.exports = {
  getS3ConfigFilePath,
  readS3Config,
  writeS3Config
};
