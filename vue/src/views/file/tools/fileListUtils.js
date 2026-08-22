export const formatFileSize = (sizeBytes, sizeText) => {
  if (sizeText) return sizeText
  const bytes = Number(sizeBytes)
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export const isFolder = (file) => {
  const type = String(file?.type || '')
  return type === 'directory' || type === 'folder'
}

export const isArchiveFile = (file) => {
  const type = String(file?.type || '')
  if (type === 'archive') return true
  const name = String(file?.name || '').toLowerCase()
  return ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz'].some((ext) => name.endsWith(ext))
}

export const getFileTypeText = (type) => {
  const map = {
    directory: '文件夹',
    folder: '文件夹',
    file: '文件',
    text: '文本',
    image: '图片',
    archive: '压缩包',
    executable: '可执行',
  }
  return map[String(type || '')] || '文件'
}

export const getFileTypeClass = (type) => {
  const map = {
    directory: 'type-folder',
    folder: 'type-folder',
    archive: 'type-archive',
    image: 'type-image',
    text: 'type-text',
  }
  return map[String(type || '')] || 'type-file'
}

export const getFileIconClass = (file) => {
  const type = String(file?.type || '')
  if (type === 'directory' || type === 'folder') return 'fas fa-folder'
  if (type === 'image') return 'fas fa-file-image'
  if (type === 'archive' || isArchiveFile(file)) return 'fas fa-file-archive'
  if (type === 'text') return 'fas fa-file-lines'
  if (type === 'executable') return 'fas fa-file-code'
  return 'fas fa-file'
}
