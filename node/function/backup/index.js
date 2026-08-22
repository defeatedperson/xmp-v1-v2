const ContainerBackupManager = require('./container-backup-manager')
const ContainerRestoreManager = require('./container-restore-manager')
const WebsiteBackupManager = require('./website-backup-manager')
const WebsiteRestoreManager = require('./website-restore-manager')

const backupManager = new ContainerBackupManager()
const restoreManager = new ContainerRestoreManager()
const websiteBackupManager = new WebsiteBackupManager()
const websiteRestoreManager = new WebsiteRestoreManager()

module.exports = {
  ContainerBackupManager,
  ContainerRestoreManager,
  WebsiteBackupManager,
  WebsiteRestoreManager,
  backupManager,
  restoreManager,
  websiteBackupManager,
  websiteRestoreManager
}
