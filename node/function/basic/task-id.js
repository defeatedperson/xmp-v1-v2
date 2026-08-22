function isValidTaskId(input) {
  const value = String(input || '').trim()
  if (value.length !== 36) return false
  if (!/^[0-9a-f-]+$/.test(value)) return false
  return true
}

module.exports = { isValidTaskId }

