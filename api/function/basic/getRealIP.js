/**
 * 获取客户端真实IP地址
 * 根据环境变量 REVERSE_PROXY 配置决定是否使用反向代理头
 * 内网部署不过滤私有IP地址
 * 
 * @param {Object} req - Express请求对象
 * @returns {string} 客户端真实IP地址
 */
function getRealIP(req) {
  // 默认不启用反向代理
  let useReverseProxy = false;
  
  try {
    // 尝试读取环境变量，如果文件不存在或变量未设置，默认为false
    if (process.env.REVERSE_PROXY && process.env.REVERSE_PROXY.toLowerCase() === 'true') {
      useReverseProxy = true;
    }
  } catch {
    // 如果读取环境变量出错（如文件不存在），默认不使用反向代理
    console.warn('无法读取REVERSE_PROXY配置，默认不使用反向代理模式');
    useReverseProxy = false;
  }
  
  if (useReverseProxy) {
    // 反向代理模式下，优先使用代理头
    // 按优先级检查常见的代理头
    const proxyHeaders = [
      'x-forwarded-for',  // 最常见的代理头，可能包含多个IP
      'x-real-ip',        // Nginx常用
      'x-client-ip',      // 某些代理使用
      'x-cluster-client-ip' // 某些负载均衡器使用
    ];
    
    for (const header of proxyHeaders) {
      const headerValue = req.headers[header];
      if (headerValue) {
        // 对于x-forwarded-for，可能包含多个IP，取第一个
        if (header === 'x-forwarded-for') {
          const ips = headerValue.split(',').map(ip => ip.trim());
          // 返回第一个非空的IP
          for (const ip of ips) {
            if (ip && ip !== 'unknown') {
              return ip;
            }
          }
        } else {
          // 其他头直接返回
          if (headerValue !== 'unknown') {
            return headerValue;
          }
        }
      }
    }
  }
  
  // 非代理模式或代理头未找到时，使用标准方式获取IP
  // 优先使用Express的req.ip（需要设置trust proxy）
  if (req.ip) {
    return req.ip;
  }
  
  // 回退到连接层级的IP
  const connection = req.connection;
  const socket = req.socket;
  
  if (connection && connection.remoteAddress) {
    return connection.remoteAddress;
  }
  
  if (socket && socket.remoteAddress) {
    return socket.remoteAddress;
  }
  
  // 最后的回退
  return 'unknown';
}

module.exports = {
  getRealIP
};