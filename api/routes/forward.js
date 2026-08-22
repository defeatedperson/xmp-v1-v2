// 主控路由：统一转发模块
// - /api/forward/:id/* 透传请求到对应被控（HTTP + WebSocket）
const express = require('express')
const https = require('https')
const router = express.Router()
const httpProxy = require('http-proxy')
const { forward, resolveNodeAddress, buildTargetUrl } = require('../function/forward')
const { getClientCert } = require('../function/node/node-ca')
const { getRealIP } = require('../function/basic/getRealIP')
const { validateToken } = require('../function/basic/login/account-token')
const { URL } = require('url')

// 创建统一代理实例，支持 HTTP 与 WS
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true })

/**
 * 安全执行函数，避免因对象方法不存在而报错
 * @param {Function|any} fn - 要执行的函数
 */
function safeCall(fn) {
  try {
    if (typeof fn === 'function') {
      fn()
    }
  } catch {}
}

/**
 * 解析 Cookie 头部
 * @param {string|undefined} cookieHeader - Cookie 头部字符串
 * @returns {Object} 解析后的 Cookie 对象
 */
function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return {}
  const cookies = {}
  const parts = String(cookieHeader).split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (!key) continue
    const rawVal = part.slice(idx + 1).trim()
    try {
      cookies[key] = decodeURIComponent(rawVal)
    } catch {
      cookies[key] = rawVal
    }
  }
  return cookies
}

// 代理错误处理
proxy.on('error', (err, req, res) => {
  try {
    if (res && typeof res.setHeader === 'function' && !res.headersSent) {
      res.statusCode = 502
      res.end(JSON.stringify({ success: false, message: '连接远程节点失败', error: err.message }))
    } else if (res && typeof res.destroy === 'function') {
      safeCall(() => res.destroy())
    }
  } catch {}
  try { console.error('WS/HTTP proxy error:', err && err.message) } catch {}
})

// WS 连接建立时的处理
try {
  proxy.on('open', (proxySocket) => {
    safeCall(() => proxySocket.setKeepAlive(true, 30000))
    safeCall(() => proxySocket.setTimeout(600000, () => {
      safeCall(() => proxySocket.destroy())
    }))
    safeCall(() => proxySocket.on('error', () => {
      safeCall(() => proxySocket.destroy())
    }))
  })
  proxy.on('close', (proxyRes, proxySocket) => {
    safeCall(() => proxySocket && proxySocket.destroy && proxySocket.destroy())
  })
} catch {}



// HTTP 转发入口
router.all('/api/forward/:id/*', async (req, res) => {
  await forward(req, res)
})

module.exports = router

/**
 * 在 HTTPS 服务器 upgrade 阶段接管 WebSocket 连接并转发到被控
 * @param {https.Server} server - HTTPS 服务器实例
 */
router.attachUpgradeHandler = function attachUpgradeHandler(server) {
  if (!server || typeof server.on !== 'function') return

  server.on('upgrade', async (req, socket, head) => {
    try {
      // 错误处理
      safeCall(() => socket.on('error', () => safeCall(() => socket.destroy())))

      // 设置连接保活和超时
      safeCall(() => socket.setKeepAlive(true, 30000))
      safeCall(() => socket.setTimeout(600000, () => safeCall(() => socket.destroy())))

      // 解析 URL 路径，提取节点 ID 和子路径
      const url = new URL(req.url, 'https://localhost')
      const match = url.pathname.match(/^\/api\/forward\/(\d+)\/(.*)$/)
      if (!match) {
        return
      }

      const nodeId = parseInt(match[1])
      const subpath = match[2] || ''
      if (isNaN(nodeId) || nodeId < 1 || !subpath) {
        socket.destroy()
        return
      }

      // 验证主控端用户身份
      const cookies = parseCookieHeader(req.headers && req.headers.cookie)
      const token = cookies && cookies.auth_token
      const clientIP = getRealIP(req)
      if (!token || !clientIP || clientIP === 'unknown' || !validateToken(token, clientIP)) {
        socket.destroy()
        return
      }

      // 获取 mTLS 客户端证书
      let cert = null
      try {
        cert = await getClientCert()
      } catch (certErr) {
        console.error('获取客户端证书失败:', certErr.message)
        socket.destroy()
        return
      }

      // 解析目标地址并构造 URL
      const address = await resolveNodeAddress(nodeId)
      const targetUrl = buildTargetUrl(address, subpath, { originalUrl: req.url })
      const targetOrigin = targetUrl.origin.replace(/^https?:/, 'wss:')

      // 改写 URL 路径
      req.url = targetUrl.pathname + targetUrl.search

      // 使用 mTLS 发起 WebSocket 代理
      // 关键修正：http-proxy 不会自动将 cert/key 应用到 WebSocket 握手，必须显式创建 Agent
      const agent = new https.Agent({
        cert: cert.cert,
        key: cert.key,
        ca: cert.caCert,
        rejectUnauthorized: true
      })

      proxy.ws(req, socket, head, {
        target: targetOrigin,
        agent: agent,
        secure: true
      })

      // 监听连接关闭
      safeCall(() => socket.on('close', () => safeCall(() => socket.destroy())))
      safeCall(() => socket.on('end', () => safeCall(() => socket.destroy())))
    } catch (err) {
      try { console.error('WS upgrade error:', err && err.message) } catch {}
      safeCall(() => socket.destroy())
    }
  })
}
