/**
 * 主控到被控的统一转发模块
 * - 目标协议固定为 HTTPS
 * - 透传原请求方法、查询串与常用头，进行双向流式转发
 * - 使用 mTLS 双向认证
 */
const https = require('https')
const { URL } = require('url')
const { getAddressById } = require('../node/dataTool')
const { getClientCert } = require('../node/node-ca')

/**
 * 根据节点ID解析被控地址
 * @param {string|number} id 节点ID
 * @returns {Promise<string>} 被控地址字符串
 * @throws {Error} 400（ID非法）、404（节点不存在或无地址）
 */
async function resolveNodeAddress(id) {
  const nid = parseInt(id)
  if (isNaN(nid) || nid < 1) {
    const err = new Error('invalid id')
    err.status = 400
    throw err
  }
  const address = await getAddressById(nid)
  if (!address) {
    const err = new Error('node not found')
    err.status = 404
    throw err
  }
  return address
}

/**
 * 构建目标 URL（https://address/<subpath>?<originalQuery>）
 * @param {string} address 被控地址（可能含端口）
 * @param {string} subpath 被控路由子路径
 * @param {import('express').Request} req 原始请求对象（用于提取查询串）
 * @returns {URL} 目标 URL 对象
 */
function buildTargetUrl(address, subpath, req) {
  const base = new URL('https://' + address)
  const cleaned = (subpath || '').replace(/^\/+/, '')
  base.pathname = '/' + cleaned
  const search = new URL(req.originalUrl, 'https://localhost').search
  base.search = search
  return base
}

/**
 * 复制并清洗下游请求头
 * - 覆盖 host 为目标主机
 * - 移除 content-length/connection 以便 Node 重新计算
 * @param {import('express').Request} req 原始请求
 * @param {URL} targetUrl 目标 URL
 * @returns {Record<string, string | string[]>} 上游请求头
 */
function copyHeaders(req, targetUrl) {
  const headers = { ...req.headers }
  headers.host = targetUrl.host
  delete headers['content-length']
  delete headers['connection']
  return headers
}

/**
 * 转发入口（支持所有方法与二进制流）
 * 流程：校验参数 → 解析节点地址 → 获取 mTLS 证书 → https.request → 双向 pipe
 * 错误码：400/404/502/504
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function forward(req, res) {
  let clientCert = null
  try {
    clientCert = await getClientCert()
  } catch (certErr) {
    console.error('获取客户端证书失败:', certErr.message)
    res.status(500).json({ success: false, message: '获取客户端证书失败' })
    return
  }

  try {
    const subpath = req.params[0] || ''
    if (!subpath) {
      res.status(400).json({ success: false, message: '子路径不能为空' })
      return
    }

    const nodeId = parseInt(req.params.id)
    if (isNaN(nodeId) || nodeId < 1) {
      res.status(400).json({ success: false, message: '无效的节点ID' })
      return
    }

    const address = await resolveNodeAddress(nodeId)
    const targetUrl = buildTargetUrl(address, subpath, req)
    const headers = copyHeaders(req, targetUrl)

    const isJson = (req.headers['content-type'] || '').includes('application/json')
    let bodyData = null
    if (isJson && req.body) {
      if (typeof req.body === 'string') {
        bodyData = req.body
      } else {
        try { bodyData = JSON.stringify(req.body) } catch { bodyData = null }
      }
    }

    if (bodyData) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = Buffer.byteLength(bodyData)
    }

    // mTLS 配置
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port ? parseInt(targetUrl.port) : 443,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers,
      cert: clientCert.cert,
      key: clientCert.key,
      ca: clientCert.caCert,
      rejectUnauthorized: true
    }

    const upstreamReq = https.request(options, (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode || 502
      const headers = upstreamRes.headers || {}
      for (const k of Object.keys(headers)) {
        try {
          res.setHeader(k, headers[k])
        } catch {}
      }
      // 上游响应直接管道到下游响应，实现流式透传
      upstreamRes.pipe(res)
    })

    upstreamReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ success: false, message: '上游错误', error: err.message })
      } else {
        try { res.end() } catch {}
      }
    })

    // 简单超时控制，超时销毁连接并返回 504
    upstreamReq.setTimeout(15000, () => {
      upstreamReq.destroy(new Error('timeout'))
    })

    // 原请求体直接管道到上游；若JSON已被解析，直接写入字符串化的body
    if (bodyData) {
      upstreamReq.write(bodyData)
      upstreamReq.end()
    } else {
      req.pipe(upstreamReq)
    }
  } catch (error) {
    const status = error.status || 500
    res.status(status).json({ success: false, message: '转发失败', error: error.message })
  }
}

module.exports = {
  resolveNodeAddress,
  buildTargetUrl,
  forward
}
