const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { getPath } = require('../../config/paths');
const { isValidDomainName } = require('../basic/domain');

/**
 * Web规则配置文件管理工具
 * 用于管理每个域名的官方配置和自定义配置文件
 * 
 * 配置文件存储结构：
 * data/www/openresty/web-rules/{domain}/
 * ├── official.conf    # 官方配置
 * └── custom.conf      # 自定义配置
 */

/**
 * 配置类型常量
 */
const CONFIG_TYPES = {
  OFFICIAL: 'official',
  CUSTOM: 'custom'
};

/**
 * 验证配置类型是否有效
 * @param {string} type - 配置类型
 * @returns {boolean} 是否有效
 */
function isValidConfigType(type) {
  return Object.values(CONFIG_TYPES).includes(type);
}

/**
 * 验证域名并返回规范化域名
 * @param {string} domain - 原始域名
 * @returns {string} 规范化后的域名
 * @throws {Error} 域名无效时抛出错误
 */
function validateDomain(domain) {
  const value = String(domain || '').trim();
  if (!value) throw new Error('域名不能为空');
  if (!isValidDomainName(value)) throw new Error('域名格式无效');
  return value;
}

/**
 * 获取域名配置目录路径
 * @param {string} domain - 域名
 * @returns {string} 配置目录路径
 */
function getDomainConfigDir(domain) {
  const validatedDomain = validateDomain(domain);
  return getPath('data', 'www', 'openresty', 'web-rules', validatedDomain);
}

/**
 * 获取配置文件完整路径
 * @param {string} domain - 域名
 * @param {string} type - 配置类型 ('official' | 'custom')
 * @returns {string} 配置文件路径
 */
function getConfigFilePath(domain, type) {
  const validatedDomain = validateDomain(domain);
  if (!isValidConfigType(type)) {
    throw new Error(`配置类型无效，支持类型: ${Object.values(CONFIG_TYPES).join(', ')}`);
  }
  return path.join(getDomainConfigDir(validatedDomain), `${type}.conf`);
}

/**
 * 确保域名配置目录存在，不存在则创建
 * @param {string} domain - 域名
 * @returns {Promise<string>} 配置目录路径
 */
async function ensureDomainConfigDir(domain) {
  const configDir = getDomainConfigDir(domain);
  try {
    await fsp.mkdir(configDir, { recursive: true });
    return configDir;
  } catch (error) {
    throw new Error(`创建配置目录失败: ${error.message}`);
  }
}

/**
 * 读取指定域名的配置文件内容
 * @param {string} domain - 域名
 * @param {string} type - 配置类型 ('official' | 'custom')
 * @returns {Promise<{success: boolean, content: string, filePath: string, created: boolean}>}
 */
async function readWebRuleConfig(domain, type) {
  try {
    const filePath = getConfigFilePath(domain, type);
    const configDir = await ensureDomainConfigDir(domain);
    
    // 检查文件是否存在
    let created = false;
    try {
      await fsp.access(filePath, fs.constants.F_OK);
    } catch {
      // 文件不存在，创建空文件
      await fsp.writeFile(filePath, '', 'utf8');
      created = true;
    }
    
    // 读取文件内容
    const content = await fsp.readFile(filePath, 'utf8');
    
    return {
      success: true,
      content: content || '',
      filePath,
      created
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      content: '',
      filePath: '',
      created: false
    };
  }
}

/**
 * 更新指定域名的配置文件内容（覆盖模式）
 * @param {string} domain - 域名
 * @param {string} type - 配置类型 ('official' | 'custom')
 * @param {string} content - 配置内容
 * @returns {Promise<{success: boolean, filePath: string, bytesWritten: number}>}
 */
async function updateWebRuleConfig(domain, type, content) {
  try {
    // 参数验证
    if (content === undefined || content === null) {
      throw new Error('配置内容不能为空');
    }
    
    const contentStr = String(content);
    const filePath = getConfigFilePath(domain, type);
    const configDir = await ensureDomainConfigDir(domain);
    
    // 写入文件（覆盖模式）
    await fsp.writeFile(filePath, contentStr, 'utf8');
    
    // 获取文件大小
    const stats = await fsp.stat(filePath);
    
    return {
      success: true,
      filePath,
      bytesWritten: stats.size
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: '',
      bytesWritten: 0
    };
  }
}

module.exports = {
  // 常量
  CONFIG_TYPES,
  
  // 核心功能
  readWebRuleConfig,
  updateWebRuleConfig
};