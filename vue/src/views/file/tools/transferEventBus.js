class TransferEventBus {
  constructor() {
    this.events = {}
  }
  on(event, callback) {
    if (!this.events[event]) this.events[event] = []
    this.events[event].push(callback)
  }
  off(event, callback) {
    if (!this.events[event]) return
    this.events[event] = this.events[event].filter((cb) => cb !== callback)
  }
  emit(event, data) {
    if (!this.events[event]) return
    this.events[event].forEach((cb) => {
      try {
        cb(data)
      } catch (e) {
        console.error(e)
      }
    })
  }
  clear() {
    this.events = {}
  }
  listenerCount(event) {
    return this.events[event] ? this.events[event].length : 0
  }
}
export const transferEventBus = new TransferEventBus()
export const TRANSFER_EVENTS = {
  ITEMS_ADDED: 'transfer:items-added',
  ITEMS_REMOVED: 'transfer:items-removed',
  REFRESH_REQUIRED: 'transfer:refresh-required',
  CLEAR_ALL: 'transfer:clear-all',
  CURRENT_NODE_CHANGED: 'transfer:current-node-changed',
  CURRENT_PATH_CHANGED: 'transfer:current-path-changed',
  STATUS_UPDATED: 'transfer:status-updated',
  BATCH_STATUS_UPDATED: 'transfer:batch-status-updated',
}
