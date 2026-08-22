const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    resetPassword: (data) => ipcRenderer.invoke('reset-password', data),
    startServer: () => ipcRenderer.invoke('start-server'),
    stopServer: () => ipcRenderer.invoke('stop-server'),
    onServerLog: (callback) => ipcRenderer.on('server-log', (_event, value) => callback(value)),
    onTabsUpdate: (callback) => ipcRenderer.on('tabs-updated', (_event, value) => callback(value)),
    activateTab: (id) => ipcRenderer.invoke('tabs-activate', id),
    closeTab: (id) => ipcRenderer.invoke('tabs-close', id),
    duplicateTab: (id) => ipcRenderer.invoke('tabs-duplicate', id)
});
