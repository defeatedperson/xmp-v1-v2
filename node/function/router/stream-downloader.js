const log = require('../basic/log')

async function streamDownload(res, filePath, fileName) {
  const fs = require('fs')
  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  const range = res.req.headers['range']
  let start = 0
  let end = fileSize - 1

  if (range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range)
    if (m) {
      start = parseInt(m[1], 10)
      if (m[2]) end = parseInt(m[2], 10)
      if (isNaN(start) || start > end || start >= fileSize || end >= fileSize) {
        res.status(416)
        res.setHeader('Content-Range', `bytes */${fileSize}`)
        return res.end()
      }
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
    }
  } else {
    res.status(200)
  }

  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
  res.setHeader('Content-Length', String(end - start + 1))
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'no-cache')

  const stream = fs.createReadStream(filePath, { start, end })
  stream.on('error', () => {
    log.error('流下载', 'read error').catch(() => {})
    try { res.destroy() } catch {}
  })
  stream.pipe(res)
}

module.exports = {
  streamDownload
}
