const fs = require('fs');
const path = require('path');
const { getPath } = require('../../config/paths');

function ensureFile() {
  const file = getPath('data', 'xcc', 'data.json');
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(file)) {
    const defaultData = {
      acl: {
        whitelist: ['127.0.0.1'],
        blacklist: ['192.168.1.1']
      },
      domains: [
        {
          domain: '1.2.com',
          origin: 'http://127.0.0.1',
          origin_host: '',
          timeout: 60,
          cache_ttl: 0,
          cc_domain_threshold: 0,
          cc_ip_threshold: 0,
          cc_allow_interactive: false,
          rl_max_req: 0,
          https_enabled: true,
          redirect_http_to_https: false
        }
      ],
      acme_upstream: ''
    };
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
  return file;
}

function parseContent(content) {
  if (typeof content === 'string') {
    return JSON.parse(content);
  }
  if (content && typeof content === 'object') {
    return content;
  }
  throw new Error('内容不能为空');
}

function validateContent(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('JSON格式错误');
  const domains = obj.domains;
  if (!Array.isArray(domains)) throw new Error('JSON格式错误：domains必须为数组');
  
  // 过滤掉无效的域名配置，防止脏数据写入
  obj.domains = domains.filter((x) => x && typeof x.domain === 'string' && x.domain.trim());

  const validCount = obj.domains.length;
  if (validCount > 10) throw new Error('域名数量超过限制（最多10个）');
}

function getFileContent() {
  const file = ensureFile();
  const raw = fs.readFileSync(file, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return { domains: [] };
  }
}

function setFileContent(content) {
  const file = ensureFile();
  const obj = parseContent(content);
  validateContent(obj);
  const data = JSON.stringify(obj, null, 2);
  fs.writeFileSync(file, data, 'utf-8');
  return true;
}

function getDomainList() {
  const data = getFileContent();
  const list = Array.isArray(data.domains) ? data.domains : [];
  return list.map((item) => item && item.domain).filter(Boolean);
}

module.exports = {
  getFileContent,
  setFileContent,
  getDomainList,
};
