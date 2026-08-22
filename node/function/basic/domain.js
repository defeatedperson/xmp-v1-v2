function isValidDomainName(input) {
  const value = String(input || '').trim().toLowerCase()
  if (!value) return false
  if (/[^ -~]/.test(value)) return false
  if (value.length > 253) return false
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const parts = value.split('.')
    for (const part of parts) {
      const n = Number(part)
      if (!Number.isInteger(n) || n < 0 || n > 255) return false
    }
    return true
  }
  if (!value.includes('.')) return false
  const labels = value.split('.')
  for (const label of labels) {
    if (!label || label.length > 63) return false
    if (!/^[a-z0-9-]+$/.test(label)) return false
    if (label.startsWith('-') || label.endsWith('-')) return false
  }
  const last = labels[labels.length - 1]
  if (!/^[a-z]{2,}$/.test(last)) return false
  return true
}

module.exports = { isValidDomainName }

