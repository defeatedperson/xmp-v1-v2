const { WebSocketServer } = require('ws')
const { URL } = require('url')
const { dockerAdvancedManager } = require('../function/docker')
const { isValidDockerIdentifier } = require('../function/basic/docker-identifier')
const { Client } = require('ssh2')

const wss = new WebSocketServer({ noServer: true })

function verifyMtls(socket) {
  const cert = socket.getPeerCertificate()
  const hasCert = cert && Object.keys(cert).length > 0
  const authorized = socket.authorized === true
  if (!hasCert || !authorized) {
    return false
  }
  return true
}

function attachUpgradeHandler(server) {
  if (!server || typeof server.on !== 'function') return

  server.on('upgrade', async (req, socket, head) => {
    try {
      socket.on('error', () => { try { socket.destroy() } catch {} })
      const u = new URL(req.url, 'https://localhost')

      const dockerMatch = u.pathname.match(/^\/docker\/containers\/([^/]+)\/terminal\/ws$/)
      const sshMatch = u.pathname.match(/^\/ssh\/terminal\/ws$/)
      if (!dockerMatch && !sshMatch) return

      if (!verifyMtls(socket)) { try { socket.destroy() } catch {} return }

      if (dockerMatch) {
        const containerId = dockerMatch[1]
        if (!isValidDockerIdentifier(containerId)) { try { socket.destroy() } catch {} return }
        const rows = u.searchParams.get('rows')
        const cols = u.searchParams.get('cols')
        const shell = u.searchParams.get('shell')
        const options = {}
        if (rows && cols) { options.rows = parseInt(rows, 10) || undefined; options.cols = parseInt(cols, 10) || undefined }
        if (shell) {
          const s = String(shell || '').trim()
          const needsInteractive = /(^|\/)bash$/.test(s) || /(^|\/)sh$/.test(s) || /(^|\/)zsh$/.test(s)
          options.shell = needsInteractive ? [s, '-i'] : [s]
        }
        let session
        try { session = await dockerAdvancedManager.createTerminalSession(containerId, options) } catch { try { socket.destroy() } catch {} return }
        wss.handleUpgrade(req, socket, head, (ws) => {
          const stream = session.stream
          let closed = false
          let heartbeat
          function safeClose(code = 1000, reason = '') {
            if (closed) return
            closed = true
            try { clearInterval(heartbeat) } catch {}
            try { stream.destroy() } catch {}
            try { if (ws.readyState === ws.OPEN || ws.readyState === ws.CLOSING) ws.close(code, reason) } catch {}
          }
          try {
            ws.isAlive = true
            ws.on('pong', () => { ws.isAlive = true })
            heartbeat = setInterval(() => {
              try {
                if (ws.isAlive === false) { return safeClose(1006, 'heartbeat timeout') }
                ws.isAlive = false
                ws.ping()
              } catch {}
            }, 30000)
          } catch {}
          const MAX_BUFFER = 2 * 1024 * 1024
          const RESUME_THRESHOLD = 256 * 1024
          let resumeTimer = null
          stream.on('data', (chunk) => {
            try {
              if (ws.readyState === ws.OPEN) {
                if (ws.bufferedAmount > MAX_BUFFER) {
                  try { stream.pause() } catch {}
                  if (!resumeTimer) {
                    resumeTimer = setInterval(() => {
                      try {
                        if (ws.bufferedAmount <= RESUME_THRESHOLD) {
                          clearInterval(resumeTimer)
                          resumeTimer = null
                          try { stream.resume() } catch {}
                        }
                      } catch {}
                    }, 100)
                  }
                }
                ws.send(chunk, { binary: true })
              }
            } catch {}
          })
          stream.on('error', () => { safeClose(1011, 'upstream error') })
          stream.on('end', () => { safeClose(1000, 'upstream end') })
          ws.on('message', (data) => {
            try {
              let buf
              if (Buffer.isBuffer(data)) { buf = data }
              else if (data && typeof data.byteLength === 'number') { buf = Buffer.from(new Uint8Array(data)) }
              else if (typeof data === 'string') { buf = Buffer.from(data, 'utf8') }
              else { return }
              stream.write(buf)
            } catch {}
          })
          ws.on('close', () => { safeClose(1000, 'client closed') })
          ws.on('error', () => { safeClose(1011, 'client error') })
        })
        return
      }

      const host = u.searchParams.get('host') || '127.0.0.1'
      const port = parseInt(u.searchParams.get('port') || '22', 10)
      const user = u.searchParams.get('user') || ''
      const rows = u.searchParams.get('rows')
      const cols = u.searchParams.get('cols')
      const ptyRows = rows ? parseInt(rows, 10) : undefined
      const ptyCols = cols ? parseInt(cols, 10) : undefined
      if (process.platform !== 'linux') { try { socket.destroy() } catch {} return }
      if (!/^127\.0\.0\.1$|^localhost$/i.test(host)) { try { socket.destroy() } catch {} return }

      wss.handleUpgrade(req, socket, head, (ws) => {
        let closed = false
        let heartbeat
        let resumeTimer = null
        let conn = null
        let stream = null
        const MAX_BUFFER = 2 * 1024 * 1024
        const RESUME_THRESHOLD = 256 * 1024
        function safeClose(code = 1000, reason = '') {
          if (closed) return
          closed = true
          try { clearInterval(heartbeat) } catch {}
          try { clearInterval(resumeTimer) } catch {}
          try { if (stream) stream.destroy() } catch {}
          try { if (conn) conn.end() } catch {}
          try { if (ws.readyState === ws.OPEN || ws.readyState === ws.CLOSING) ws.close(code, reason) } catch {}
        }
        try {
          ws.isAlive = true
          ws.on('pong', () => { ws.isAlive = true })
          heartbeat = setInterval(() => {
            try {
              if (ws.isAlive === false) { return safeClose(1006, 'heartbeat timeout') }
              ws.isAlive = false
              ws.ping()
            } catch {}
          }, 30000)
        } catch {}

        ws.once('message', (data) => {
          try {
            let payload
            if (typeof data === 'string') payload = JSON.parse(data)
            else if (Buffer.isBuffer(data)) payload = JSON.parse(data.toString('utf8'))
            else if (data && typeof data.byteLength === 'number') payload = JSON.parse(Buffer.from(new Uint8Array(data)).toString('utf8'))
            else return safeClose(1008, 'auth required')
            if (!payload || payload.type !== 'auth' || !payload.password || !user) return safeClose(1008, 'auth required')
            const password = String(payload.password)
            payload.password = ''
            conn = new Client()
            conn.on('ready', () => {
              conn.shell({ term: 'xterm-256color', rows: ptyRows, cols: ptyCols }, (err, s) => {
                if (err) { return safeClose(1011, 'ssh error') }
                stream = s
                stream.on('data', (chunk) => {
                  try {
                    if (ws.readyState === ws.OPEN) {
                      if (ws.bufferedAmount > MAX_BUFFER) {
                        try { stream.pause() } catch {}
                        if (!resumeTimer) {
                          resumeTimer = setInterval(() => {
                            try {
                              if (ws.bufferedAmount <= RESUME_THRESHOLD) {
                                clearInterval(resumeTimer)
                                resumeTimer = null
                                try { stream.resume() } catch {}
                              }
                            } catch {}
                          }, 100)
                        }
                      }
                      ws.send(chunk, { binary: true })
                    }
                  } catch {}
                })
                stream.on('error', () => { safeClose(1011, 'upstream error') })
                stream.on('close', () => { safeClose(1000, 'upstream end') })
              })
            })
            conn.on('error', () => { safeClose(1011, 'ssh error') })
            conn.on('end', () => { safeClose(1000, 'ssh end') })
            conn.connect({ host, port, username: user, password })
          } catch { safeClose(1008, 'auth required') }
        })

        ws.on('message', (data) => {
          try {
            if (!stream) return
            if (typeof data === 'string') {
              try {
                const msg = JSON.parse(data)
                if (msg && msg.type === 'resize') {
                  const r = parseInt(msg.rows || 0, 10) || ptyRows || 24
                  const c = parseInt(msg.cols || 0, 10) || ptyCols || 80
                  try { stream.setWindow(r, c, 0, 0) } catch {}
                  return
                }
              } catch {}
              stream.write(Buffer.from(data, 'utf8'))
              return
            }
            if (Buffer.isBuffer(data)) { stream.write(data); return }
            if (data && typeof data.byteLength === 'number') { stream.write(Buffer.from(new Uint8Array(data))); return }
          } catch {}
        })
        ws.on('close', () => { safeClose(1000, 'client closed') })
        ws.on('error', () => { safeClose(1011, 'client error') })
      })
    } catch {
      try { socket.destroy() } catch {}
    }
  })
}

module.exports = { attachUpgradeHandler }

