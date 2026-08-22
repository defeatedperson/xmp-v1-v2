/**
 * 进程监控工具模块
 * 提供进程列表获取、搜索、排序等功能
 */

const { exec } = require('child_process');
const os = require('os');

/**
 * 执行系统命令获取进程列表
 * @returns {Promise<Array>} 进程列表数组
 */
function getProcessListFromSystem() {
  return new Promise((resolve, reject) => {
    // 检查操作系统类型
    if (os.platform() !== 'linux') {
      return reject(new Error('当前操作系统不支持此功能，仅支持Linux系统'));
    }

    // 使用ps命令获取进程信息
    // 参数说明:
    // -e: 选择所有进程
    // -o: 自定义输出格式
    // pid,ppid,cmd,%cpu,%mem,user,etime: 指定输出字段
    const cmd = 'ps -eo pid,ppid,cmd,%cpu,%mem,user,etime --no-headers';

    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`执行ps命令失败: ${error.message}`));
      }

      if (stderr) {
        return reject(new Error(`ps命令执行出错: ${stderr}`));
      }

      try {
        // 解析命令输出
        const processes = [];
        const lines = stdout.trim().split('\n');

        for (const line of lines) {
          if (line.trim()) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 7) {
              // 提取命令名称（从CMD字段中提取）
              const cmdField = parts.slice(2, parts.length - 4).join(' ');
              const commandName = cmdField.split(' ')[0].split('/').pop();

              processes.push({
                pid: parseInt(parts[0]) || 0,
                ppid: parseInt(parts[1]) || 0,
                cmd: cmdField,
                name: commandName,
                cpu: parseFloat(parts[parts.length - 4]) || 0,
                memory: parseFloat(parts[parts.length - 3]) || 0,
                user: parts[parts.length - 2],
                etime: parts[parts.length - 1]
              });
            }
          }
        }

        resolve(processes);
      } catch (parseError) {
        reject(new Error(`解析进程信息失败: ${parseError.message}`));
      }
    });
  });
}

/**
 * 获取系统进程列表
 * @returns {Promise<Array>} 进程列表数组
 */
async function getProcessList() {
  try {
    const processes = await getProcessListFromSystem();
    return processes.map(process => ({
      pid: process.pid,
      name: process.name,
      cpu: process.cpu || 0,
      memory: process.memory || 0,
      ppid: process.ppid,
      cmd: process.cmd || '',
      uid: process.user
    }));
  } catch (error) {
    throw new Error(`获取进程列表失败: ${error.message}`);
  }
}

/**
 * 搜索进程
 * @param {Array} processList - 进程列表
 * @param {string} searchTerm - 搜索关键词（进程名或PID）
 * @returns {Array} 过滤后的进程列表
 */
function searchProcesses(processList, searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string') {
    return processList;
  }
  
  const term = searchTerm.toLowerCase().trim();
  return processList.filter(process => {
    const processName = process.name.toLowerCase();
    const processPid = process.pid.toString();
    return processName.includes(term) || processPid.includes(term);
  });
}

/**
 * 按指定字段排序进程列表
 * @param {Array} processList - 进程列表
 * @param {string} sortBy - 排序字段（cpu, memory, name, pid）
 * @param {string} sortOrder - 排序方式（asc, desc）
 * @returns {Array} 排序后的进程列表
 */
function sortProcesses(processList, sortBy = 'cpu', sortOrder = 'desc') {
  const validSortFields = ['cpu', 'memory', 'name', 'pid'];
  const validSortOrders = ['asc', 'desc'];
  
  if (!validSortFields.includes(sortBy)) {
    sortBy = 'cpu';
  }
  
  if (!validSortOrders.includes(sortOrder)) {
    sortOrder = 'desc';
  }
  
  return [...processList].sort((a, b) => {
    let aValue = a[sortBy];
    let bValue = b[sortBy];
    
    // 处理字符串排序（进程名）
    if (sortBy === 'name') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }
    
    // 执行排序
    if (aValue < bValue) {
      return sortOrder === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortOrder === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

/**
 * 获取进程统计信息
 * @param {Array} processList - 进程列表
 * @returns {Object} 统计信息
 */
function getProcessStats(processList) {
  if (!Array.isArray(processList) || processList.length === 0) {
    return {
      total: 0,
      totalCpu: 0,
      totalMemory: 0,
      averageCpu: 0,
      averageMemory: 0
    };
  }
  
  const totalCpu = processList.reduce((sum, p) => sum + (p.cpu || 0), 0);
  const totalMemory = processList.reduce((sum, p) => sum + (p.memory || 0), 0);
  
  return {
    total: processList.length,
    totalCpu: Math.round(totalCpu * 100) / 100,
    totalMemory: Math.round(totalMemory * 100) / 100,
    averageCpu: Math.round((totalCpu / processList.length) * 100) / 100,
    averageMemory: Math.round((totalMemory / processList.length) * 100) / 100
  };
}

/**
 * 综合方法：获取并处理进程数据
 * @param {Object} options - 处理选项
 * @param {string} options.search - 搜索关键词
 * @param {string} options.sortBy - 排序字段
 * @param {string} options.sortOrder - 排序方式
 * @returns {Promise<Object>} 处理后的进程数据和统计信息
 */
async function getProcessedProcessData(options = {}) {
  try {
    // 获取原始进程列表
    let processes = await getProcessList();
    
    // 搜索过滤
    if (options.search) {
      processes = searchProcesses(processes, options.search);
    }
    
    // 排序处理
    if (options.sortBy) {
      processes = sortProcesses(processes, options.sortBy, options.sortOrder);
    }
    
    // 获取统计信息
    const stats = getProcessStats(processes);
    
    return {
      success: true,
      data: {
        processes,
        stats,
        filters: {
          search: options.search || '',
          sortBy: options.sortBy || 'cpu',
          sortOrder: options.sortOrder || 'desc'
        }
      },
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
}

module.exports = {
  getProcessList,
  searchProcesses,
  sortProcesses,
  getProcessStats,
  getProcessedProcessData
};