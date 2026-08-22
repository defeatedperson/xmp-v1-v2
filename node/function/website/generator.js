const fs = require('fs');
const path = require('path');
const { getPath } = require('../../config/paths');
const { isValidDomainName } = require('../basic/domain');

function ensureConfDir() {
  const dir = getPath('data', 'www', 'openresty', 'conf');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 校验主域名，仅允许非空且不包含路径分隔符
function validatePrimaryDomain(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('primaryDomain 不能为空');
  if (value.length > 255) throw new Error('primaryDomain 长度不能超过 255 字符');
  if (/[/\\]/.test(value)) throw new Error('primaryDomain 不能包含路径分隔符');
  if (!isValidDomainName(value)) throw new Error('primaryDomain 格式无效');
  return value;
}

function normalizePort(raw, defaultPort) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return defaultPort;
  if (n < 1 || n > 65535) return defaultPort;
  return n;
}

function normalizeWorkDir(raw) {
  const value = String(raw || '').trim();
  if (!value || value === '/') return '';
  let v = value;
  if (v.startsWith('/')) v = v.replace(/^\/+/, '');
  if (!v) return '';
  if (v.includes('.')) throw new Error('workDir 不能包含 .');
  return v;
}

function buildAcmeLines(indent) {
  const pad = indent || '';
  const lines = [];
  lines.push(pad + 'location ^~ /.well-known/acme-challenge/ {');
  lines.push(pad + '    root /acme-challenges;');
  lines.push(pad + '    default_type text/plain;');
  lines.push(pad + '    try_files $uri =404;');
  lines.push(pad + '}');
  lines.push(pad + 'if ( $uri ~ "^/\\.well-known/.*\\.(php|jsp|py|js|css|lua|ts|go|zip|tar\\.gz|rar|7z|sql|bak)$" ) {');
  lines.push(pad + '    return 403; ');
  lines.push(pad + '}');
  return lines;
}

// 从 JSON 结构中提取 server_name 列表
function buildServerNames(site) {
  const names = [];
  const seen = new Set();
  const add = (v) => {
    const s = String(v || '').trim();
    if (!s) return;
     if (/[;\r\n]/.test(s)) return;
    if (seen.has(s)) return;
    seen.add(s);
    names.push(s);
  };
  add(site.primaryDomain);
  if (Array.isArray(site.serverNames)) {
    for (const v of site.serverNames) add(v);
  }
  if (Array.isArray(site.domains)) {
    for (const v of site.domains) add(v);
  }
  if (site.serverName) {
    add(site.serverName);
  }
  return names;
}

// 生成 site-meta 注释行，供后续从 conf 反推 JSON 使用
function renderSiteMeta(site) {
  const meta = {
    id: String(site.id || site.primaryDomain || '').trim(),
    primaryDomain: site.primaryDomain,
    type: site.type,
    listenPort: site.listenPort,
    enabled: site.enabled,
    httpsEnabled: site.httpsEnabled,
    httpsRedirect: site.httpsRedirect,
    accessLogEnabled: site.accessLogEnabled,
    errorLogEnabled: site.errorLogEnabled,
    templateVersion: site.templateVersion,
    workDir: site.workDir
  };
  return '# site-meta: ' + JSON.stringify(meta);
}

// 渲染 HTTP server 块（根据 type / 日志开关 / HTTPS 跳转 控制细节）
function renderHttpServerBlock(site, serverName) {
  const accessLogEnabled = site.accessLogEnabled !== false;
  const errorLogEnabled = site.errorLogEnabled !== false;
  const rootDir = site.workDir ? `/www/website/${site.primaryDomain}/${site.workDir}` : `/www/website/${site.primaryDomain}`;
  const lines = [];
  lines.push('server {');
  lines.push(`    listen ${site.listenPort};`);
  lines.push(`    server_name ${serverName};`);
  if (site.httpsEnabled && site.httpsRedirect) {
    lines.push('');
    for (const line of buildAcmeLines('    ')) {
      lines.push(line);
    }
    lines.push('');
    lines.push('    location / {');
    lines.push('        return 301 https://$host$request_uri;');
    lines.push('    }');
  } else {
    lines.push('');
    lines.push(`    root ${rootDir};`);
    lines.push('    index index.php index.html index.htm default.php default.htm default.html;');
    lines.push('');
    if (accessLogEnabled) {
      lines.push(`    access_log /www/web_log/${site.primaryDomain}.access.log main;`);
    } else {
      lines.push('    access_log off;');
    }
    if (errorLogEnabled) {
      lines.push(`    error_log  /www/web_log/${site.primaryDomain}.error.log  warn;`);
    } else {
      lines.push('    error_log  /dev/null  emerg;');
    }
    lines.push('');
    lines.push('    location ~ ^/(\\.user.ini|\\.htaccess|\\.git|\\.env|\\.svn|\\.project|LICENSE|README.md) {');
    lines.push('        return 404; ');
    lines.push('    }');
    lines.push('');
    lines.push(`    include /www/web-rules/${site.primaryDomain}/*.conf;`);
    lines.push('');
    for (const line of buildAcmeLines('    ')) {
      lines.push(line);
    }
    lines.push('');
    if (site.type === 'proxy') {
      lines.push('    location / {');
      lines.push(`        proxy_pass ${site.proxyTarget};`);
      lines.push('        proxy_set_header Host $host;');
      lines.push('        proxy_set_header X-Real-IP $remote_addr;');
      lines.push('        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
      lines.push('        proxy_set_header X-Forwarded-Proto $scheme;');
      lines.push('    }');
    }
    if (site.type === 'php') {
      lines.push('');
      lines.push('    location ~ [^/]\\.php(/|$) {');
      lines.push('        try_files $uri =404;');
      lines.push(`        fastcgi_pass 127.0.0.1:${site.phpFastcgiPort};`);
      lines.push('        include fastcgi_params;');
      lines.push('        fastcgi_split_path_info ^(.+?\\.php)(/.*)$;');
      lines.push('        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;');
      lines.push('        fastcgi_param PATH_INFO $fastcgi_path_info;');
      lines.push('    }');
    }
  }
  lines.push('}');
  return lines.join('\n');
}

// 渲染 HTTPS server 块（仅在 httpsEnabled=true 时生成）
function renderHttpsServerBlock(site, serverName) {
  const accessLogEnabled = site.accessLogEnabled !== false;
  const errorLogEnabled = site.errorLogEnabled !== false;
  const listenParts = ['listen 443 ssl'];
  if (site.http2Enabled) listenParts.push('http2');
  const rootDir = site.workDir ? `/www/website/${site.primaryDomain}/${site.workDir}` : `/www/website/${site.primaryDomain}`;
  const lines = [];
  lines.push('server {');
  lines.push(`    ${listenParts.join(' ')};`);
  lines.push(`    server_name ${serverName};`);
  lines.push('');
  lines.push(`    root ${rootDir};`);
  lines.push('    index index.php index.html index.htm default.php default.htm default.html;');
  lines.push('');
  if (accessLogEnabled) {
    lines.push(`    access_log /www/web_log/${site.primaryDomain}.access.log main;`);
  } else {
    lines.push('    access_log off;');
  }
  if (errorLogEnabled) {
    lines.push(`    error_log  /www/web_log/${site.primaryDomain}.error.log  warn;`);
  } else {
    lines.push('    error_log  /dev/null  emerg;');
  }
  lines.push('');
  lines.push(`    ssl_certificate /www/certs/${site.certName}/fullchain.pem;`);
  lines.push(`    ssl_certificate_key /www/certs/${site.certName}/privkey.pem;`);
  lines.push('    ssl_protocols TLSv1.3 TLSv1.2;');
  lines.push('    ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256:!aNULL:!eNULL:!EXPORT:!DSS:!DES:!RC4:!3DES:!MD5:!PSK:!KRB5:!SRP:!CAMELLIA:!SEED;');
  lines.push('    ssl_prefer_server_ciphers off;');
  lines.push('    ssl_session_cache shared:SSL:10m;');
  lines.push('    ssl_session_timeout 10m;');
  lines.push('    error_page 497 https://$host$request_uri;');
  lines.push('    add_header Strict-Transport-Security "max-age=31536000";');
  lines.push('');
  lines.push('    location ~ ^/(\\.user.ini|\\.htaccess|\\.git|\\.env|\\.svn|\\.project|LICENSE|README.md) {');
  lines.push('        return 404; ');
  lines.push('    }');
  lines.push('');
  lines.push(`    include /www/web-rules/${site.primaryDomain}/*.conf;`);
  lines.push('');
  for (const line of buildAcmeLines('    ')) {
    lines.push(line);
  }
  lines.push('');
  if (site.type === 'proxy') {
    lines.push('    location / {');
    lines.push(`        proxy_pass ${site.proxyTarget};`);
    lines.push('        proxy_set_header Host $host;');
    lines.push('        proxy_set_header X-Real-IP $remote_addr;');
    lines.push('        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    lines.push('        proxy_set_header X-Forwarded-Proto $scheme;');
    lines.push('    }');
  }
  if (site.type === 'php') {
    lines.push('');
    lines.push('    location ~ [^/]\\.php(/|$) {');
    lines.push('        try_files $uri =404;');
    lines.push(`        fastcgi_pass 127.0.0.1:${site.phpFastcgiPort};`);
    lines.push('        include fastcgi_params;');
    lines.push('        fastcgi_split_path_info ^(.+?\\.php)(/.*)$;');
    lines.push('        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;');
    lines.push('        fastcgi_param PATH_INFO $fastcgi_path_info;');
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}

// 核心模板引擎：根据站点 JSON 生成完整配置文本（不落盘）
function renderSiteConfigFromJson(rawSite) {
  if (!rawSite || typeof rawSite !== 'object') {
    throw new Error('站点配置必须为对象');
  }
  const primaryDomain = validatePrimaryDomain(rawSite.primaryDomain);
  const type = String(rawSite.type || 'static').trim();
  const enabled = rawSite.enabled !== false;
  const listenPort = normalizePort(rawSite.listenPort, 80);
  const site = {
    id: primaryDomain,
    primaryDomain,
    type,
    enabled,
    listenPort,
    httpsEnabled: !!rawSite.httpsEnabled,
    httpsRedirect: !!rawSite.httpsRedirect,
    accessLogEnabled: rawSite.accessLogEnabled !== false,
    errorLogEnabled: rawSite.errorLogEnabled !== false,
    templateVersion: rawSite.templateVersion || 'v1',
    certName: rawSite.certName || '',
    phpFastcgiPort: normalizePort(rawSite.phpFastcgiPort, 0),
    proxyTarget: rawSite.proxyTarget || '',
    http2Enabled: !!rawSite.http2Enabled,
    workDir: normalizeWorkDir(rawSite.workDir),
    serverNames: rawSite.serverNames,
    domains: rawSite.domains,
    serverName: rawSite.serverName
  };
  if (!['static', 'php', 'proxy'].includes(site.type)) {
    throw new Error(`不支持的站点类型: ${site.type}`);
  }
  if (site.type === 'php' && !site.phpFastcgiPort) {
    throw new Error('PHP 站点必须提供合法的 phpFastcgiPort');
  }
  if (site.type === 'proxy' && !site.proxyTarget) {
    throw new Error('反向代理站点必须提供 proxyTarget');
  }
  if (site.httpsEnabled && !site.certName) {
    throw new Error('启用 HTTPS 时必须提供 certName');
  }
  if (site.httpsEnabled && /[/\\]/.test(site.certName || '')) {
    throw new Error('certName 不能包含路径分隔符');
  }
  if (site.proxyTarget && /[\r\n;]/.test(site.proxyTarget)) {
    throw new Error('proxyTarget 格式非法');
  }
  const names = buildServerNames(site);
  const serverName = names.length > 0 ? names.join(' ') : site.primaryDomain;
  const blocks = [];
  blocks.push(renderHttpServerBlock(site, serverName));
  if (site.httpsEnabled) {
    blocks.push(renderHttpsServerBlock(site, serverName));
  }
  const metaLine = renderSiteMeta(site);
  return metaLine + '\n' + blocks.join('\n\n') + '\n';
}

// 根据站点 JSON 写入或删除配置文件：
// - enabled=true  => 写入并覆盖同名 conf
// - enabled=false => 删除已存在的 conf（若存在）
function applySiteConfigFromJson(rawSite) {
  if (!rawSite || typeof rawSite !== 'object') {
    throw new Error('站点配置必须为对象');
  }
  const primaryDomain = validatePrimaryDomain(rawSite.primaryDomain);
  const enabled = rawSite.enabled !== false;
  const confDir = ensureConfDir();
  const confFile = primaryDomain + '.conf';
  const fullPath = path.join(confDir, confFile);
  if (!enabled) {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return { success: true, removed: true, path: fullPath, confFile, primaryDomain, enabled: false };
    }
    return { success: true, removed: false, path: fullPath, confFile, primaryDomain, enabled: false };
  }
  const content = renderSiteConfigFromJson({ ...rawSite, primaryDomain });
  fs.writeFileSync(fullPath, content);
  return { success: true, removed: false, path: fullPath, confFile, primaryDomain, enabled: true };
}

module.exports = {
  renderSiteConfigFromJson,
  applySiteConfigFromJson
};
