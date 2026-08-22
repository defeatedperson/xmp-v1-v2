function isValidDockerIdentifier(input) {
  const value = String(input || '').trim()
  if (!value) return false
  if (value.length < 3 || value.length > 64) return false
  if (/[^-A-Za-z0-9_.]/.test(value)) return false
  return true
}

module.exports = { isValidDockerIdentifier }

