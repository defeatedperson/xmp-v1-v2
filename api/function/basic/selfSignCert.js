const forge = require('node-forge')

function normalizeCertName(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const replaced = s.replace(/[^a-zA-Z0-9_-]+/g, '_')
  const trimmed = replaced.replace(/^_+|_+$/g, '')
  return trimmed
}

function parseDomains(input) {
  if (Array.isArray(input)) {
    return input.map((s) => String(s || '').trim()).filter((s) => s.length > 0)
  }
  return String(input || '')
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function selfSignCert({ domains, days = 365, certName }) {
  const list = parseDomains(domains)
  if (!list.length) throw new Error('缺少域名')
  const primary = list[0]
  const name = normalizeCertName(certName || primary)
  const validDays = Number.isFinite(days) ? Math.max(1, Math.min(3650, Number(days))) : 365

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = new Date().getTime().toString(16)

  const now = new Date()
  const notBefore = new Date(now.getTime() - 60 * 1000)
  const notAfter = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000)
  cert.validity.notBefore = notBefore
  cert.validity.notAfter = notAfter

  const subjectAttrs = [
    { name: 'commonName', value: primary },
    { name: 'countryName', value: 'CN' },
    { shortName: 'ST', value: 'Internet' },
    { name: 'localityName', value: 'Web' },
    { name: 'organizationName', value: 'Self Signed' },
    { shortName: 'OU', value: 'XMP' },
  ]
  cert.setSubject(subjectAttrs)
  cert.setIssuer(subjectAttrs)

  const altNames = list.map((d) => ({ type: 2, value: d }))
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
    { name: 'subjectAltName', altNames },
  ])

  cert.sign(keys.privateKey, forge.md.sha256.create())

  const publicPem = forge.pki.certificateToPem(cert)
  const privatePem = forge.pki.privateKeyToPem(keys.privateKey)

  return {
    publicPem,
    privatePem,
    certName: name,
    domains: list,
    created_at: new Date().toISOString(),
    source: 'self_signed',
  }
}

module.exports = {
  selfSignCert,
}
