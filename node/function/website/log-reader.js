const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { getPath } = require('../../config/paths');
const { validateFileName } = require('../file/path-utils');

const accessLogRegex = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+([^"]*)\s+[^"]*"\s+(\d{3})\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;
const errorLogRegex = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] [^:]*: (.*?), client: ([^,]+), server: [^,]+, request: "(\S+) ([^"]*)/;

function mapToObject(map) {
  const obj = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

function topNFromMap(map, n) {
  const arr = [];
  for (const [key, count] of map.entries()) {
    arr.push({ key, count });
  }
  arr.sort((a, b) => b.count - a.count);
  if (arr.length > n) {
    return arr.slice(0, n);
  }
  return arr;
}

function validateDomain(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('域名不能为空');
  if (value.length > 255) throw new Error('域名长度不能超过 255 字符');
  if (/[/\\]/.test(value)) throw new Error('域名不能包含路径分隔符');
  return value;
}

function resolveLogDomainDir(domain) {
  const name = validateDomain(domain);
  return getPath('data', 'www', 'openresty', 'web_log', name);
}

async function listDomainLogs(domain) {
  try {
    const validatedDomain = validateDomain(domain);
    
    if (!validateFileName(validatedDomain)) {
      return { ok: false, code: 400, error: '域名格式不正确' };
    }

    const logDir = resolveLogDomainDir(validatedDomain);
    
    try {
      await fsp.access(logDir);
    } catch {
      return { ok: false, code: 404, error: '日志目录不存在' };
    }

    let entries;
    try {
      entries = await fsp.readdir(logDir, { withFileTypes: true });
    } catch {
      return { ok: false, code: 500, error: '无法读取日志目录' };
    }

    const logFiles = [];
    
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      
      const fileName = entry.name;
      if (!fileName.endsWith('.log')) continue;
      
      try {
        const filePath = path.join(logDir, fileName);
        const stats = await fsp.stat(filePath);
        
        logFiles.push({
          name: fileName,
          size: stats.size,
          modifiedTime: stats.mtime.toISOString(),
          type: 'file'
        });
      } catch {
        continue;
      }
    }

    logFiles.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));

    return {
      ok: true,
      domain: validatedDomain,
      logDirectory: logDir,
      files: logFiles,
      total: logFiles.length
    };

  } catch (error) {
    return { ok: false, code: 500, error: error.message || '服务器内部错误' };
  }
}

function resolveLogFilePath(domain, queryType) {
  const validatedDomain = validateDomain(domain);
  const baseDir = getPath('data', 'www', 'openresty', 'web_log');

  if (queryType === 'today' || queryType === 'access' || queryType === 'today-access') {
    return {
      domain: validatedDomain,
      type: 'access-today',
      path: path.join(baseDir, `${validatedDomain}.access.log`)
    };
  }

  if (queryType === 'error') {
    return {
      domain: validatedDomain,
      type: 'error',
      path: path.join(baseDir, `${validatedDomain}.error.log`)
    };
  }

  if (queryType.startsWith('old')) {
    const datePart = queryType.slice(3);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      throw new Error('old日期格式不正确，应为oldYYYY-MM-DD');
    }
    const domainDir = path.join(baseDir, validatedDomain);
    return {
      domain: validatedDomain,
      type: 'access-old',
      date: datePart,
      path: path.join(domainDir, `${datePart}.log`)
    };
  }

  throw new Error('不支持的查询类型');
}

async function analyzeDomainLog(domain, queryType) {
  try {
    const resolved = resolveLogFilePath(domain, queryType);
    let stats;

    try {
      stats = await fsp.stat(resolved.path);
    } catch {
      return { ok: false, code: 404, error: '日志文件不存在' };
    }

    const maxSize = 10 * 1024 * 1024;
    if (stats.size > maxSize) {
      return { ok: false, code: 413, error: '日志文件过大，本服务暂不支持超过10MB的日志' };
    }

    const maxDuration = 5000;
    const start = Date.now();
    let lineCount = 0;
    let timedOut = false;

    const isAccess = resolved.type === 'access-today' || resolved.type === 'access-old';
    const isError = resolved.type === 'error';

    let totalRequests = 0;
    let totalBytes = 0;
    const ipCounts = new Map();
    const statusCounts = new Map();
    const statusGroups = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 };
    const pathCounts = new Map();
    const accessTimeBuckets = new Map();

    let totalErrors = 0;
    const levelCounts = new Map();
    const errorTypeCounts = new Map();
    const errorIpCounts = new Map();
    const errorPathCounts = new Map();
    const errorTimeBuckets = new Map();

    const processAccessLine = line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const m = accessLogRegex.exec(trimmed);
      if (!m) {
        return;
      }
      const ip = m[1];
      const timeStr = m[2] || '';
      const path = m[4] || '';
      const status = m[5] || '';
      const sizeStr = m[6] || '0';
      const bytes = sizeStr === '-' ? 0 : Number.parseInt(sizeStr, 10) || 0;
      totalRequests += 1;
      totalBytes += bytes;
      if (ip) {
        const prev = ipCounts.get(ip) || 0;
        ipCounts.set(ip, prev + 1);
      }
      if (status) {
        const prevStatus = statusCounts.get(status) || 0;
        statusCounts.set(status, prevStatus + 1);
        let groupKey = 'other';
        if (status.length === 3) {
          if (status[0] === '2') groupKey = '2xx';
          else if (status[0] === '3') groupKey = '3xx';
          else if (status[0] === '4') groupKey = '4xx';
          else if (status[0] === '5') groupKey = '5xx';
        }
        statusGroups[groupKey] += 1;
      }
      if (path) {
        const prevPath = pathCounts.get(path) || 0;
        pathCounts.set(path, prevPath + 1);
      }
      let bucketKey = '';
      const tm = timeStr.match(/:(\d{2}):(\d{2}):\d{2} /);
      if (tm && tm[1] && tm[2]) {
        const hour = tm[1];
        const minute = tm[2];
        const tenMinuteBucket = Math.floor(parseInt(minute, 10) / 10) * 10;
        bucketKey = hour + ':' + (tenMinuteBucket < 10 ? '0' + tenMinuteBucket : tenMinuteBucket);
      }
      if (!bucketKey) {
        bucketKey = '00:00';
      }
      let bucket = accessTimeBuckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          requests: 0,
          bytes: 0,
          status2xx: 0,
          status3xx: 0,
          status4xx: 0,
          status5xx: 0,
          statusOther: 0
        };
        accessTimeBuckets.set(bucketKey, bucket);
      }
      bucket.requests += 1;
      bucket.bytes += bytes;
      if (status && status.length === 3) {
        if (status[0] === '2') bucket.status2xx += 1;
        else if (status[0] === '3') bucket.status3xx += 1;
        else if (status[0] === '4') bucket.status4xx += 1;
        else if (status[0] === '5') bucket.status5xx += 1;
        else bucket.statusOther += 1;
      } else {
        bucket.statusOther += 1;
      }
    };

    const processErrorLine = line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const m = errorLogRegex.exec(trimmed);
      if (!m) {
        return;
      }
      const timeStr = m[1] || '';
      const level = (m[2] || '').toLowerCase();
      const message = m[3] || '';
      const clientIp = m[4] || '';
      const path = m[6] || '';
      totalErrors += 1;
      const prevLevel = levelCounts.get(level) || 0;
      levelCounts.set(level, prevLevel + 1);
      if (message) {
        const prevMsg = errorTypeCounts.get(message) || 0;
        errorTypeCounts.set(message, prevMsg + 1);
      }
      if (clientIp) {
        const prevIp = errorIpCounts.get(clientIp) || 0;
        errorIpCounts.set(clientIp, prevIp + 1);
      }
      if (path) {
        const prevPath = errorPathCounts.get(path) || 0;
        errorPathCounts.set(path, prevPath + 1);
      }
      let bucketKey = '';
      const tm = timeStr.match(/\s(\d{2}):(\d{2}):\d{2}$/);
      if (tm && tm[1] && tm[2]) {
        const hour = tm[1];
        const minute = tm[2];
        const tenMinuteBucket = Math.floor(parseInt(minute, 10) / 10) * 10;
        bucketKey = hour + ':' + (tenMinuteBucket < 10 ? '0' + tenMinuteBucket : tenMinuteBucket);
      }
      if (!bucketKey) {
        bucketKey = '00:00';
      }
      let bucket = errorTimeBuckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          total: 0,
          levels: {}
        };
        errorTimeBuckets.set(bucketKey, bucket);
      }
      bucket.total += 1;
      const lvlCount = bucket.levels[level] || 0;
      bucket.levels[level] = lvlCount + 1;
    };

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(resolved.path, { encoding: 'utf8' });
      let buffer = '';

      const timer = setTimeout(() => {
        timedOut = true;
        stream.destroy();
      }, maxDuration);

      stream.on('data', chunk => {
        if (timedOut) {
          return;
        }

        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, index);
          if (isAccess) {
            processAccessLine(line);
          } else if (isError) {
            processErrorLine(line);
          }
          lineCount += 1;
          buffer = buffer.slice(index + 1);
        }

        if (Date.now() - start > maxDuration) {
          timedOut = true;
          stream.destroy();
        }
      });

      stream.on('end', () => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error('TIMEOUT'));
          return;
        }
        if (buffer.length > 0) {
          if (isAccess) {
            processAccessLine(buffer);
          } else if (isError) {
            processErrorLine(buffer);
          }
          lineCount += 1;
        }
        resolve();
      });

      stream.on('error', err => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error('TIMEOUT'));
        } else {
          reject(err);
        }
      });
    });

    if (timedOut || Date.now() - start > maxDuration) {
      return { ok: false, code: 408, error: '日志分析超过5秒，已中止' };
    }

    let summary = {
      lines: lineCount
    };

    if (isAccess) {
      const accessBuckets = [];
      const keys = Array.from(accessTimeBuckets.keys()).sort();
      for (const k of keys) {
        const v = accessTimeBuckets.get(k);
        accessBuckets.push({
          time: k,
          requests: v.requests,
          bytes: v.bytes,
          status2xx: v.status2xx,
          status3xx: v.status3xx,
          status4xx: v.status4xx,
          status5xx: v.status5xx,
          statusOther: v.statusOther
        });
      }
      summary = {
        lines: lineCount,
        totalRequests,
        totalBytes,
        uniqueIps: ipCounts.size,
        statusCounts: mapToObject(statusCounts),
        statusGroups,
        topIps: topNFromMap(ipCounts, 20),
        topPaths: topNFromMap(pathCounts, 20),
        timeBuckets: accessBuckets
      };
    } else if (isError) {
      const errorBuckets = [];
      const keys = Array.from(errorTimeBuckets.keys()).sort();
      for (const k of keys) {
        const v = errorTimeBuckets.get(k);
        errorBuckets.push({
          time: k,
          total: v.total,
          levels: v.levels
        });
      }
      summary = {
        lines: lineCount,
        totalErrors,
        levelCounts: mapToObject(levelCounts),
        topMessages: topNFromMap(errorTypeCounts, 20),
        topIps: topNFromMap(errorIpCounts, 20),
        topPaths: topNFromMap(errorPathCounts, 20),
        timeBuckets: errorBuckets
      };
    }

    return {
      ok: true,
      domain: resolved.domain,
      type: resolved.type,
      date: resolved.date || null,
      path: resolved.path,
      size: stats.size,
      durationMs: Date.now() - start,
      summary
    };
  } catch (error) {
    if (error && error.message === 'TIMEOUT') {
      return { ok: false, code: 408, error: '日志分析超过5秒，已中止' };
    }
    return { ok: false, code: 500, error: error.message || '服务器内部错误' };
  }
}

module.exports = {
  listDomainLogs,
  resolveLogDomainDir,
  analyzeDomainLog
};
