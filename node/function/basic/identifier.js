function isSafeIdentifier(input, opts = {}) {
  const value = String(input || '').trim()
  const min = typeof opts.min === 'number' ? opts.min : 1
  const max = typeof opts.max === 'number' ? opts.max : 64
  const pattern = opts.pattern instanceof RegExp ? opts.pattern : /^[A-Za-z0-9_]+$/
  if (!value) return false
  if (value.length < min || value.length > max) return false
  if (!pattern.test(value)) return false
  return true
}

module.exports = { isSafeIdentifier }

