const fs = require('fs');
const path = require('path');
const { getPath } = require('../../config/paths');

/**
 * 获取计划任务配置文件的完整路径
 * data/schedule/plan.json
 * @returns {string}
 */
function getSchedulePlanFilePath() {
  const dir = getPath('data', 'schedule');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'plan.json');
}

/**
 * 读取计划任务配置文件
 * - 文件不存在时自动创建默认结构
 * - 文件为空或格式错误时返回默认结构
 * @returns {{ version: number, enabled: boolean, slots: Record<string, any[]> }}
 */
function readSchedulePlan() {
  const file = getSchedulePlanFilePath();
  if (!fs.existsSync(file)) {
    const defaultPlan = createDefaultPlan();
    writeSchedulePlan(defaultPlan);
    return defaultPlan;
  }
  const txt = fs.readFileSync(file, 'utf8');
  if (!txt.trim()) {
    const defaultPlan = createDefaultPlan();
    writeSchedulePlan(defaultPlan);
    return defaultPlan;
  }
  try {
    const data = JSON.parse(txt);
    if (!data || typeof data !== 'object') {
      throw new Error('plan is not an object');
    }
    if (!data.slots || typeof data.slots !== 'object') {
      throw new Error('plan.slots is invalid');
    }
    return data;
  } catch {
    const defaultPlan = createDefaultPlan();
    writeSchedulePlan(defaultPlan);
    return defaultPlan;
  }
}

/**
 * 覆盖写入计划任务配置文件
 * @param {{ version: number, enabled: boolean, slots: Record<string, any[]> }} plan
 */
function writeSchedulePlan(plan) {
  const file = getSchedulePlanFilePath();
  const tmp = file + '.tmp';
  const payload = {
    version: Number(plan && plan.version !== undefined ? plan.version : 1),
    enabled: Boolean(plan && plan.enabled !== undefined ? plan.enabled : true),
    slots: normalizeSlots(plan && plan.slots)
  };
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * 创建默认的计划任务配置结构
 * @returns {{ version: number, enabled: boolean, slots: Record<string, any[]> }}
 */
function createDefaultPlan() {
  const slots = {};
  const hours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  for (const h of hours) {
    slots[String(h)] = [];
  }
  return {
    version: 1,
    enabled: true,
    slots
  };
}

/**
 * 规范化 slots 结构，确保包含 0-22 每两个小时的键
 * @param {Record<string, any[]>|undefined} source
 * @returns {Record<string, any[]>}
 */
function normalizeSlots(source) {
  const slots = {};
  const hours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  const src = source && typeof source === 'object' ? source : {};
  for (const h of hours) {
    const key = String(h);
    const val = src[key];
    if (Array.isArray(val)) {
      slots[key] = val;
    } else {
      slots[key] = [];
    }
  }
  return slots;
}

module.exports = {
  getSchedulePlanFilePath,
  readSchedulePlan,
  writeSchedulePlan
};

