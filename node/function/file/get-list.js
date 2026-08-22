const fs = require('fs').promises;
const path = require('path');
const { getPath } = require('../../config/paths');

/**
 * 文件管理列表类
 * 负责获取指定目录下的文件和文件夹列表
 * 支持搜索功能，返回www相对路径
 */
class FileListManager {
  constructor(wwwPath = null) {
    // 默认使用 data/www 目录
    this.wwwPath = wwwPath || getPath('data', 'www');
    this.basePath = path.resolve(this.wwwPath);
    // 初始化时确保基础目录存在
    this.ensureBasePathExists();
  }

  /**
   * 确保基础目录存在，如果不存在则创建
   */
  async ensureBasePathExists() {
    try {
      await fs.access(this.basePath);
    } catch {
      // 目录不存在，尝试创建
      try {
        await fs.mkdir(this.basePath, { recursive: true });
      } catch (mkdirError) {
        console.error('创建基础目录失败:', mkdirError.message);
      }
    }
  }

  /**
   * 获取文件列表
   * @param {string} relativePath - 相对于www的路径
   * @param {string} search - 搜索关键词
   * @returns {Promise<Object>} 返回格式化的文件列表
   */
  async getList(relativePath = '', search = '') {
    try {
      // 标准化相对路径
      relativePath = this.normalizePath(relativePath);
      
      // 构建完整路径
      const fullPath = path.join(this.basePath, relativePath);
      
      // 验证路径安全性
      if (!await this.validatePath(fullPath)) {
        return this.errorResponse('无效的路径');
      }
      
      // 检查目录是否存在，如果不存在则尝试创建
      try {
        await fs.access(fullPath);
      } catch {
        // 目录不存在，尝试创建
        try {
          await fs.mkdir(fullPath, { recursive: true });
        } catch (mkdirError) {
          return this.errorResponse('目录不存在且无法创建: ' + mkdirError.message);
        }
      }
      
      // 扫描目录
      const files = await this.scanDirectory(fullPath, search);
      
      return this.successResponse(relativePath, files);
      
    } catch (error) {
      return this.errorResponse('获取文件列表失败: ' + error.message);
    }
  }

  /**
   * 扫描指定目录
   * @param {string} fullPath - 完整路径
   * @param {string} search - 搜索关键词
   * @returns {Promise<Array>} 文件信息数组
   */
  async scanDirectory(fullPath, search = '') {
    const files = [];
    
    try {
      const items = await fs.readdir(fullPath, { withFileTypes: true });
      
      for (const item of items) {
        // 跳过当前目录和父目录
        if (item.name === '.' || item.name === '..') {
          continue;
        }
        
        // 如果有搜索条件，进行过滤
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) {
          continue;
        }
        
        const itemPath = path.join(fullPath, item.name);
        const fileInfo = await this.formatFileInfo(itemPath, item.name, item.isDirectory());
        
        if (fileInfo !== null) {
          files.push(fileInfo);
        }
      }
      
      // 排序：文件夹在前，文件在后，同类型按名称排序
      files.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      
      return files;
      
    } catch {
      return files;
    }
  }

  /**
   * 格式化文件信息
   * @param {string} filePath - 文件完整路径
   * @param {string} fileName - 文件名
   * @param {boolean} isDirectory - 是否为目录
   * @returns {Promise<Object|null>} 格式化的文件信息
   */
  async formatFileInfo(filePath, fileName, isDirectory) {
    try {
      const stats = await fs.stat(filePath);
      const relativePath = this.getRelativePath(filePath);
      
      // 获取文件类型
      const fileType = isDirectory ? 'directory' : this.detectFileType(fileName);
      
      return {
        name: fileName,
        type: fileType,
        size: isDirectory ? null : this.formatFileSize(stats.size),
        sizeBytes: isDirectory ? null : stats.size,
        modified: stats.mtime.toISOString().slice(0, 19).replace('T', ' '),
        permissions: this.formatPermissions(stats.mode),
        owner: stats.uid || 'unknown',
        relativePath: relativePath,
        isReadable: true, // 在Node.js中简化处理
        isWritable: true  // 在Node.js中简化处理
      };
      
    } catch {
      return null;
    }
  }

  /**
   * 检测文件类型
   * @param {string} fileName - 文件名
   * @returns {string} 文件类型
   */
  detectFileType(fileName) {
    // 获取文件扩展名
    const extension = path.extname(fileName).toLowerCase().slice(1);
    
    // 文本文件扩展名
    const textExtensions = [
      'txt', 'md', 'markdown', 'log', 'conf', 'config', 'ini', 'cfg',
      'json', 'xml', 'yaml', 'yml', 'csv', 'tsv',
      'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx', 'vue',
      'php', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'pl',
      'sh', 'bash', 'bat', 'cmd', 'ps1', 'sql', 'r', 'scala', 'kt', 'swift'
    ];
    
    // 图片文件扩展名
    const imageExtensions = [
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif',
      'psd', 'ai', 'eps', 'raw', 'cr2', 'nef', 'orf', 'sr2'
    ];
    
    // 压缩文件扩展名
    const archiveExtensions = [
      'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'lz', 'lzma',
      'tar.gz', 'tar.bz2', 'tar.xz', 'tgz', 'tbz2', 'txz',
      'deb', 'rpm', 'dmg', 'pkg', 'msi', 'exe', 'cab', 'iso'
    ];
    
    // 可执行文件扩展名
    const executableExtensions = [
      'exe', 'msi', 'app', 'deb', 'rpm', 'dmg', 'pkg',
      'bin', 'run', 'com', 'scr', 'bat', 'cmd', 'sh', 'bash'
    ];
    
    // 根据扩展名判断文件类型
    if (textExtensions.includes(extension)) {
      return 'text';
    } else if (imageExtensions.includes(extension)) {
      return 'image';
    } else if (archiveExtensions.includes(extension)) {
      return 'archive';
    } else if (executableExtensions.includes(extension)) {
      return 'executable';
    }
    
    // 默认返回普通文件类型
    return 'file';
  }

  /**
   * 获取相对于www的路径
   * @param {string} fullPath - 完整路径
   * @returns {string} 相对路径
   */
  getRelativePath(fullPath) {
    const relativePath = path.relative(this.basePath, fullPath);
    return this.normalizePath(relativePath);
  }

  /**
   * 标准化路径格式
   * @param {string} pathStr - 路径
   * @returns {string} 标准化后的路径
   */
  normalizePath(pathStr) {
    // 转换为正斜杠
    pathStr = pathStr.replace(/\\/g, '/');
    
    // 移除开头和结尾的斜杠
    pathStr = pathStr.replace(/^\/+|\/+$/g, '');
    
    // 如果不为空，添加开头斜杠
    if (pathStr) {
      pathStr = '/' + pathStr;
    }
    
    return pathStr;
  }

  /**
   * 验证路径安全性
   * @param {string} checkPath - 要验证的路径
   * @returns {Promise<boolean>} 是否安全
   */
  async validatePath(checkPath) {
    try {
      const realPath = await fs.realpath(checkPath);
      const realBasePath = await fs.realpath(this.basePath);
      
      // 确保路径在basePath范围内
      return realPath.startsWith(realBasePath);
    } catch {
      return false;
    }
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化的大小
   */
  formatFileSize(bytes) {
    if (bytes < 0) {
      return '0 B';
    }
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return Math.round(size * 100) / 100 + ' ' + units[unitIndex];
  }

  /**
   * 格式化文件权限
   * @param {number} mode - 权限模式
   * @returns {string} 权限字符串
   */
  formatPermissions(mode) {
    return (mode & parseInt('777', 8)).toString(8).padStart(3, '0');
  }

  /**
   * 成功响应
   * @param {string} currentPath - 当前路径
   * @param {Array} data - 数据
   * @returns {Object} 响应对象
   */
  successResponse(currentPath, data) {
    return {
      success: true,
      currentPath: currentPath,
      count: data.length,
      data: data
    };
  }

  /**
   * 错误响应
   * @param {string} message - 错误消息
   * @returns {Object} 响应对象
   */
  errorResponse(message) {
    return {
      success: false,
      error: message,
      data: []
    };
  }
}

module.exports = FileListManager;