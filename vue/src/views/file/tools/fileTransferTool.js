import { normalizeRelativePath } from './fileCreateTool'

const parseJson = async (resp) => {
  try {
    return await resp.json()
  } catch {
    return null
  }
}

const errorResult = (msg, extra = {}) => ({ success: false, message: msg || '操作失败', ...extra })
const okResult = (msg, extra = {}) => ({ success: true, message: msg || '操作成功', ...extra })

export const getClientCert = async () => {
  let resp = null
  try {
    resp = await fetch('/api/certs/client')
  } catch (e) {
    return { success: false, message: String(e && e.message ? e.message : '请求失败'), data: null }
  }
  let result = null
  try {
    result = await resp.json()
  } catch {
    result = null
  }
  if (!resp.ok || !result || result.success === false) {
    const msg = (result && (result.message || result.error)) || '获取客户端证书失败'
    return { success: false, message: msg, data: null }
  }
  return { success: true, message: '获取成功', data: result.data }
}

export const moveEntry = async ({ nodeId, sourcePath, destPath } = {}) => {
  const nid = String(nodeId ?? '').trim()
  const src = String(sourcePath || '').trim()
  const dst = String(destPath || '').trim()
  if (!nid || !src) return errorResult('参数缺失')
  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(nid)}/file/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: src, destPath: dst }),
    })
  } catch (e) {
    return errorResult(String(e && e.message ? e.message : '请求失败'))
  }
  const result = await parseJson(resp)
  if (!resp.ok || !result || result.success === false) {
    return errorResult((result && (result.message || result.error)) || '移动失败', { data: result?.data })
  }
  return okResult(result.message || '移动成功', { data: result.data })
}

export const copyEntrySameNode = async ({ nodeId, sourcePath, destPath } = {}) => {
  const nid = String(nodeId ?? '').trim()
  const src = String(sourcePath || '').trim()
  const dst = String(destPath || '').trim()
  if (!nid || !src) return errorResult('参数缺失')
  let resp = null
  try {
    resp = await fetch(`/api/forward/${encodeURIComponent(nid)}/file/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: src, destPath: dst }),
    })
  } catch (e) {
    return errorResult(String(e && e.message ? e.message : '请求失败'))
  }
  const result = await parseJson(resp)
  if (!resp.ok || !result || result.success === false || !result.taskId) {
    return errorResult((result && (result.message || result.error)) || '复制任务启动失败')
  }
  const taskId = result.taskId
  let done = false
  while (!done) {
    await new Promise((r) => setTimeout(r, 2000))
    let poll = null
    try {
      poll = await fetch(`/api/forward/${encodeURIComponent(nid)}/file-task/status?id=${encodeURIComponent(taskId)}`)
    } catch (e) {
      return errorResult(String(e && e.message ? e.message : '请求失败'))
    }
    const status = await parseJson(poll)
    if (!poll.ok || !status || status.success === false || !status.data) continue
    const task = status.data
    if (task.status === 'failed') {
      return errorResult(task.message || '复制失败')
    }
    if (task.status === 'completed') {
      done = true
      return okResult('复制成功', { data: task.result?.data })
    }
  }
  return errorResult('复制未完成')
}

const fetchNodeAddress = async (nodeId) => {
  const nid = String(nodeId ?? '').trim()
  if (!nid) return errorResult('节点ID缺失')
  let resp = null
  try {
    resp = await fetch(`/api/nodes/${encodeURIComponent(nid)}/address`)
  } catch (e) {
    return errorResult(String(e && e.message ? e.message : '请求失败'))
  }
  const result = await parseJson(resp)
  if (!resp.ok || !result || result.success === false || !result.data?.address) {
    return errorResult((result && (result.message || result.error)) || '获取节点地址失败')
  }
  return okResult('获取成功', { address: result.data.address })
}

const pollTaskUntilDone = async (nodeId, taskId, onProgress) => {
  const nid = String(nodeId ?? '').trim()
  const tid = String(taskId || '').trim()
  if (!nid || !tid) return errorResult('参数缺失')
  let done = false
  while (!done) {
    await new Promise((r) => setTimeout(r, 2000))
    let resp = null
    try {
      resp = await fetch(`/api/forward/${encodeURIComponent(nid)}/file-task/status?id=${encodeURIComponent(tid)}`)
    } catch (e) {
      return errorResult(String(e && e.message ? e.message : '请求失败'))
    }
    const status = await parseJson(resp)
    if (!resp.ok || !status || status.success === false || !status.data) continue
    const task = status.data
    if (onProgress && task.message) {
      onProgress(task.message)
    }
    if (task.status === 'failed') return errorResult(task.message || '任务失败')
    if (task.status === 'completed') {
      done = true
      return okResult('任务完成', { data: task.result?.data })
    }
  }
  return errorResult('任务未完成')
}

export const crossNodeCopy = async ({ sourceNodeId, targetNodeId, itemRelativePath, itemType, targetPath, onProgress } = {}) => {
  const srcNid = String(sourceNodeId ?? '').trim()
  const tgtNid = String(targetNodeId ?? '').trim()
  const rel = String(itemRelativePath || '').trim()
  const tPath = normalizeRelativePath(targetPath)
  if (!srcNid || !tgtNid || !rel) return errorResult('参数缺失')

  const parts = rel.startsWith('/') ? rel.split('/').filter(Boolean) : (`/${rel}`).split('/').filter(Boolean)
  const name = parts.pop() || ''
  const parent = parts.length ? `/${parts.join('/')}` : '/'
  const isFolder = itemType === 'folder' || itemType === 'directory'

  const addrRes = await fetchNodeAddress(srcNid)
  if (!addrRes.success || !addrRes.address) return errorResult(addrRes.message || '获取源节点地址失败')

  const certRes = await getClientCert()
  if (!certRes.success || !certRes.data) return errorResult(certRes.message || '获取客户端证书失败')
  const { cert: clientCert, key: clientKey } = certRes.data

  let dlResp = null
  try {
    dlResp = await fetch(`/api/forward/${encodeURIComponent(tgtNid)}/file/url-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeAddress: addrRes.address,
        type: isFolder ? 'folder' : 'file',
        path: parent,
        name: name,
        clientCert,
        clientKey,
        savePath: tPath,
      }),
    })
  } catch (e) {
    return errorResult(String(e && e.message ? e.message : '请求失败'))
  }
  const dlJson = await parseJson(dlResp)
  if (!dlResp.ok || !dlJson || dlJson.success === false || !dlJson.taskId) {
    return errorResult((dlJson && (dlJson.message || dlJson.error)) || '目标节点下载失败')
  }
  const poll = await pollTaskUntilDone(tgtNid, dlJson.taskId, onProgress)
  if (!poll.success) return errorResult(poll.message)
  return okResult('跨节点复制成功', { data: poll.data })
}
