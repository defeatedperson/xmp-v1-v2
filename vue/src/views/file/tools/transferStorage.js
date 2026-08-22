const STORAGE_KEY = 'file-transfer-items'
const STORAGE_VERSION = '2.1.0'
export const TRANSFER_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error',
}

const safeParse = (value) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const ensureItem = (item) => {
  if (!item || !item.id || !item.nodeId || !item.relativePath || !item.type) return null
  return {
    ...item,
    transferStatus: item.transferStatus || TRANSFER_STATUS.PENDING,
  }
}

export class TransferStorage {
  static getItems() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { items: [], lastUpdated: Date.now(), version: STORAGE_VERSION }
    }
    const parsed = safeParse(raw)
    if (!parsed || parsed.version !== STORAGE_VERSION) {
      return { items: [], lastUpdated: Date.now(), version: STORAGE_VERSION }
    }
    const list = Array.isArray(parsed.items) ? parsed.items.map(ensureItem).filter(Boolean) : []
    return { items: list, lastUpdated: parsed.lastUpdated || Date.now(), version: STORAGE_VERSION }
  }

  static saveItems(items) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          items: Array.isArray(items) ? items : [],
          lastUpdated: Date.now(),
          version: STORAGE_VERSION,
        }),
      )
      return true
    } catch {
      return false
    }
  }

  static generateId() {
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 11)
    return `transfer_${ts}_${rand}`
  }

  static deduplicate(items) {
    const seen = new Map()
    for (const item of items) {
      const key = `${item.nodeId}_${item.relativePath}_${item.name || ''}`
      seen.set(key, item)
    }
    const result = []
    const added = new Set()
    for (const item of items) {
      const key = `${item.nodeId}_${item.relativePath}_${item.name || ''}`
      if (!added.has(key)) {
        result.push(seen.get(key))
        added.add(key)
      }
    }
    return result
  }

  static addItems(newItems) {
    if (!Array.isArray(newItems) || !newItems.length) return true
    const current = this.getItems()
    const existingIds = new Set(current.items.map((i) => i.id))
    const incoming = newItems
      .map(ensureItem)
      .filter(Boolean)
      .filter((item) => !existingIds.has(item.id))
    if (!incoming.length) return true
    const merged = this.deduplicate([...current.items, ...incoming])
    return this.saveItems(merged)
  }

  static removeItems(ids) {
    if (!Array.isArray(ids) || !ids.length) return true
    const current = this.getItems()
    const set = new Set(ids)
    const filtered = current.items.filter((item) => !set.has(item.id))
    return this.saveItems(filtered)
  }

  static clearAll() {
    return this.saveItems([])
  }

  static updateItemStatus(itemId, status) {
    if (!Object.values(TRANSFER_STATUS).includes(status)) return false
    const current = this.getItems()
    const index = current.items.findIndex((item) => item.id === itemId)
    if (index === -1) return false
    current.items[index] = {
      ...current.items[index],
      transferStatus: status,
      lastStatusUpdate: Date.now(),
    }
    return this.saveItems(current.items)
  }

  static updateItemsStatus(itemIds, status) {
    if (!Array.isArray(itemIds) || !itemIds.length) return true
    if (!Object.values(TRANSFER_STATUS).includes(status)) return false
    const current = this.getItems()
    const idSet = new Set(itemIds)
    let changed = false
    current.items = current.items.map((item) => {
      if (!idSet.has(item.id)) return item
      changed = true
      return { ...item, transferStatus: status, lastStatusUpdate: Date.now() }
    })
    return changed ? this.saveItems(current.items) : true
  }
}
