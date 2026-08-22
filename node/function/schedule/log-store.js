const log = require('../basic/log')

async function getScheduleLogs(options = {}) {
  const days = Number(options.days || 3)
  const limit = Number(options.limit || 100)
  const maxDays = days > 0 ? days : 1
  const result = []
  for (let i = 0; i < maxDays; i++) {
    const offset = -i
    let list
    try {
      list = await log.getList(offset)
    } catch {
      list = []
    }
    if (!Array.isArray(list) || !list.length) continue
    for (const item of list) {
      if (!item || item.type !== 'schedule') continue
      result.push(item)
      if (result.length >= limit) return result
    }
  }
  return result
}

module.exports = {
  getScheduleLogs
}

