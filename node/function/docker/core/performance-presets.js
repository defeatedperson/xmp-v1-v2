/**
 * 容器性能预设配置模块
 * 提供容器性能限制的预设方案和相关工具函数
 */

// 容器性能预设方案：按 CPU 核数和内存容量进行限制
const PERFORMANCE_PRESETS = {
  0: { nanoCpus: 0, memoryBytes: 0 },                          // 不限制
  1: { nanoCpus: 500000000, memoryBytes: 1 * 1024 * 1024 * 1024 },   // 0.5 核 / 1G
  2: { nanoCpus: 1000000000, memoryBytes: 2 * 1024 * 1024 * 1024 },  // 1 核 / 2G
  3: { nanoCpus: 2000000000, memoryBytes: 4 * 1024 * 1024 * 1024 },  // 2 核 / 4G
  4: { nanoCpus: 4000000000, memoryBytes: 8 * 1024 * 1024 * 1024 },  // 4 核 / 8G
  5: { nanoCpus: 8000000000, memoryBytes: 8 * 1024 * 1024 * 1024 }   // 8 核 / 8G
};

/**
 * 根据容器 HostConfig 中的 CPU/内存限制推断预设方案编号。
 * 返回值：
 * - plan: 0 表示不限制；1-5 对应预设方案；-1 表示非预设（自定义或外部修改）
 * - nanoCpus: 当前 CPU 限制（纳秒级份额）
 * - memoryBytes: 当前内存限制（字节）
 * @param {Object} hostConfig - 容器 HostConfig 对象
 * @returns {Object} 包含方案编号和当前限制的对象
 */
function resolvePerformancePlanFromHostConfig(hostConfig) {
  const hc = hostConfig || {};
  const nano = Number(hc.NanoCpus || 0);
  const mem = Number(hc.Memory || 0);
  if ((!nano || nano <= 0) && (!mem || mem <= 0)) {
    return { plan: 0, nanoCpus: 0, memoryBytes: 0 };
  }
  for (const [key, preset] of Object.entries(PERFORMANCE_PRESETS)) {
    const id = Number(key);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (preset && preset.nanoCpus === nano && preset.memoryBytes === mem) {
      return { plan: id, nanoCpus: nano, memoryBytes: mem };
    }
  }
  return { plan: -1, nanoCpus: nano, memoryBytes: mem };
}

/**
 * 应用性能预设到容器配置
 * @param {Object} hostConfig - 容器 HostConfig 对象
 * @param {number} performancePlan - 性能方案编号
 * @returns {Object} 更新后的 HostConfig
 */
function applyPerformancePreset(hostConfig, performancePlan) {
  const config = { ...hostConfig };
  const planId = Number.isFinite(performancePlan) ? Number(performancePlan) : 0;
  const preset = PERFORMANCE_PRESETS[planId] || PERFORMANCE_PRESETS[0];
  
  if (preset && preset.nanoCpus && preset.nanoCpus > 0) {
    config.NanoCpus = preset.nanoCpus;
  }
  if (preset && preset.memoryBytes && preset.memoryBytes > 0) {
    config.Memory = preset.memoryBytes;
  }
  
  return config;
}

module.exports = {
  PERFORMANCE_PRESETS,
  resolvePerformancePlanFromHostConfig,
  applyPerformancePreset
};