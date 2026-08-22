function parseIntInRange(value, opts = {}) {
  const v = value === undefined || value === null ? undefined : Number.parseInt(String(value), 10)
  const min = typeof opts.min === 'number' ? opts.min : Number.MIN_SAFE_INTEGER
  const max = typeof opts.max === 'number' ? opts.max : Number.MAX_SAFE_INTEGER
  const def = opts.defaultValue
  if (!Number.isFinite(v)) return def
  if (v < min) return min
  if (v > max) return max
  return v
}

function parseBooleanLike(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue
  if (typeof value === 'boolean') return value
  const s = String(value).trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  return defaultValue
}

module.exports = { parseIntInRange, parseBooleanLike }

