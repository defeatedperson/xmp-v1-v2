const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const ConfigManager = require('./utils/config');
const ServerManager = require('./utils/server');

let mainWindow;
let configManager;
let serverManager;
let downloadItems = new Map(); // 存储下载项: startTime -> item
let isQuitting = false; // 应用退出标志位
const tabs = new Map();
const webContentsToTab = new Map();
let activeTabId = null;
let apiTabId = null;
let downloadTabId = null;
let tabSeq = 1;
let rendererReady = false;
const TAB_BAR_HEIGHT = 41;
const MAX_TABS = 8;
let currentApiPort = null;

// 初始化管理器
const appRoot = app.getAppPath(); // 在开发和打包环境中有所不同
configManager = new ConfigManager(appRoot);
serverManager = new ServerManager(configManager.getApiDir());

function getTabListPayload() {
    return Array.from(tabs.values()).map(tab => ({
        id: tab.id,
        title: tab.title,
        type: tab.type,
        url: tab.url || '',
        pinned: tab.pinned,
        closable: tab.closable,
        copyable: tab.copyable,
        flash: tab.flash
    }));
}

function sendTabsUpdate() {
    if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) return;
    mainWindow.webContents.send('tabs-updated', {
        tabs: getTabListPayload(),
        activeTabId
    });
}

function getActiveView() {
    const activeTab = tabs.get(activeTabId);
    if (!activeTab) return null;
    return activeTab.view || null;
}

function updateActiveViewBounds() {
    if (!mainWindow) return;
    const view = getActiveView();
    if (!view) return;
    const bounds = mainWindow.getContentBounds();
    view.setBounds({ x: 0, y: TAB_BAR_HEIGHT, width: bounds.width, height: bounds.height - TAB_BAR_HEIGHT });
    view.setAutoResize({ width: true, height: true });
}

function attachViewForActiveTab() {
    if (!mainWindow) return;
    const currentView = getActiveView();
    const existingViews = mainWindow.getBrowserViews();
    existingViews.forEach(view => {
        mainWindow.removeBrowserView(view);
    });
    if (currentView) {
        mainWindow.setBrowserView(currentView);
        updateActiveViewBounds();
    }
}

function setActiveTab(id) {
    if (!tabs.has(id)) return;
    activeTabId = id;
    const tab = tabs.get(id);
    if (tab && tab.flash) {
        tab.flash = false;
    }
    attachViewForActiveTab();
    sendTabsUpdate();
}

function createBrowserView(options) {
    return new BrowserView({
        webPreferences: options
    });
}

function isInternalApiUrl(targetUrl) {
    if (!targetUrl || !currentApiPort) return false;
    if (targetUrl.hostname !== '127.0.0.1' && targetUrl.hostname !== 'localhost') return false;
    return targetUrl.port === String(currentApiPort);
}

function isDownloadUrl(targetUrl) {
    if (!targetUrl) return false;
    return /^\/api\/forward\/\d+\/file\/download$/.test(targetUrl.pathname);
}

function openHiddenDownloadWindow(url) {
    const win = new BrowserWindow({
        show: false,
        width: 0,
        height: 0,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    const cleanup = () => {
        if (!win.isDestroyed()) {
            win.destroy();
        }
    };

    win.webContents.session.on('will-download', (_event, item) => {
        handleDownload(item, null);
        item.once('done', () => {
            cleanup();
        });
    });

    win.webContents.loadURL(url).catch(() => {
        cleanup();
    });
}

function registerView(tab) {
    const { view } = tab;
    if (!view) return;
    webContentsToTab.set(view.webContents.id, tab.id);

    view.webContents.on('page-title-updated', (_event, title) => {
        if (!tab.pinned) {
            tab.title = title || '新页面';
            sendTabsUpdate();
        }
    });

    view.webContents.on('did-finish-load', () => {
        if (!tab.pinned) {
            const title = view.webContents.getTitle();
            if (title) {
                tab.title = title;
                sendTabsUpdate();
            }
        }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
        let targetUrl;
        try {
            targetUrl = new URL(url);
        } catch {
            return { action: 'deny' };
        }

        if (!isInternalApiUrl(targetUrl)) {
            shell.openExternal(url);
            return { action: 'deny' };
        }

        if (isDownloadUrl(targetUrl)) {
            openHiddenDownloadWindow(url);
            return { action: 'deny' };
        }

        const result = createUrlTab(url, true, true);
        if (!result.success && result.error === 'TAB_LIMIT') {
            sendTabsUpdate();
        }
        return { action: 'deny' };
    });

    view.webContents.on('will-navigate', (event, url) => {
        let targetUrl;
        try {
            targetUrl = new URL(url);
        } catch {
            return;
        }

        if (!isInternalApiUrl(targetUrl)) {
            event.preventDefault();
            shell.openExternal(url);
            return;
        }

        if (isDownloadUrl(targetUrl)) {
            event.preventDefault();
            openHiddenDownloadWindow(url);
        }
    });

    view.webContents.session.on('will-download', (_event, item) => {
        handleDownload(item, tab.id);
    });
}

function createTab(tab) {
    if (tabs.size >= MAX_TABS && !tab.pinned) {
        return { success: false, error: 'TAB_LIMIT' };
    }
    tabs.set(tab.id, tab);
    if (tab.view) {
        registerView(tab);
    }
    sendTabsUpdate();
    return { success: true, id: tab.id };
}

function createUrlTab(url, activate = true, closeOnDownload = false) {
    const id = `tab-${tabSeq++}`;
    const view = createBrowserView({ nodeIntegration: false, contextIsolation: true });
    const tab = {
        id,
        type: 'page',
        title: '新页面',
        url,
        view,
        pinned: false,
        closable: true,
        copyable: true,
        flash: false,
        closeOnDownload
    };
    const result = createTab(tab);
    if (!result.success) return result;
    view.webContents.loadURL(url);
    if (activate) setActiveTab(id);
    return result;
}

function closeTab(id) {
    const tab = tabs.get(id);
    if (!tab || tab.pinned) return { success: false };
    if (tab.view) {
        webContentsToTab.delete(tab.view.webContents.id);
        tab.view.webContents.destroy();
    }
    tabs.delete(id);
    if (activeTabId === id) {
        setActiveTab('home');
    } else {
        sendTabsUpdate();
    }
    return { success: true };
}

function closeNonPinnedTabs() {
    Array.from(tabs.values()).forEach(tab => {
        if (!tab.pinned) {
            closeTab(tab.id);
        }
    });
    setActiveTab('home');
}

function handleDownload(item, sourceTabId) {
    const fileName = item.getFilename();
    const startTime = Date.now();
    const totalBytes = item.getTotalBytes();
    const downloadsDir = app.getPath('downloads');
    const savePath = path.join(downloadsDir, fileName);
    item.setSavePath(savePath);
    downloadItems.set(startTime, item);

    const downloadTab = tabs.get(downloadTabId);
    if (downloadTab) {
        if (downloadTabId !== activeTabId) {
            downloadTab.flash = true;
        }
        sendTabsUpdate();
    }

    if (downloadTab && downloadTab.view && !downloadTab.view.webContents.isDestroyed()) {
        downloadTab.view.webContents.send('download-progress', {
            filename: fileName,
            state: 'progressing',
            receivedBytes: 0,
            totalBytes,
            startTime,
            savePath
        });
    }

    item.on('updated', (_event, state) => {
        if (downloadTab && downloadTab.view && !downloadTab.view.webContents.isDestroyed()) {
            downloadTab.view.webContents.send('download-progress', {
                filename: fileName,
                state,
                receivedBytes: item.getReceivedBytes(),
                totalBytes: item.getTotalBytes(),
                startTime,
                savePath: item.getSavePath()
            });
        }
    });

    item.once('done', (_event, state) => {
        downloadItems.delete(startTime);
        if (downloadTab && downloadTab.view && !downloadTab.view.webContents.isDestroyed()) {
            downloadTab.view.webContents.send('download-progress', {
                filename: fileName,
                state,
                receivedBytes: item.getReceivedBytes(),
                totalBytes: item.getTotalBytes(),
                startTime,
                savePath: item.getSavePath()
            });
        }

        const sourceTab = tabs.get(sourceTabId);
        if (sourceTab && sourceTab.closeOnDownload) {
            closeTab(sourceTabId);
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, process.platform === 'linux' ? '../ico/favicon.png' : '../ico/favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    
    // 隐藏菜单栏
    mainWindow.setMenu(null);

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
    
    // 主窗口关闭时退出整个应用
    mainWindow.on('close', () => {
        app.quit();
    });
    
    // 开发环境打开调试工具
    // mainWindow.webContents.openDevTools();

    mainWindow.on('resize', () => {
        updateActiveViewBounds();
    });

    mainWindow.webContents.on('did-finish-load', () => {
        rendererReady = true;
        sendTabsUpdate();
    });
}

function createInitialTabs() {
    createTab({
        id: 'home',
        type: 'home',
        title: '首页',
        url: '',
        view: null,
        pinned: true,
        closable: false,
        copyable: false,
        flash: false
    });

    const downloadView = createBrowserView({ nodeIntegration: true, contextIsolation: false });
    const downloadTab = {
        id: 'download',
        type: 'download',
        title: '下载',
        url: 'file://download',
        view: downloadView,
        pinned: true,
        closable: false,
        copyable: false,
        flash: false
    };
    createTab(downloadTab);
    downloadTabId = 'download';
    downloadView.webContents.loadFile(path.join(__dirname, 'renderer/download.html'));

    activeTabId = 'home';
    sendTabsUpdate();
}

// 启动 API 服务并切换视图
async function startApiServer(event) {
    const config = configManager.loadEnv();
    const port = parseInt(config.PORT || 5008);

    try {
        // 1. 检查端口
        const isPortAvailable = await serverManager.checkPort(port);
        if (!isPortAvailable) {
            // 友好的端口占用提示，并给出建议
            const suggestedPort = port + 100;
            const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: '端口占用提示',
                message: `检测到端口 ${port} 被其他程序占用。`,
                detail: `XMP 无法在该端口启动。建议您：\n1. 检查并关闭占用该端口的后台程序\n2. 或者尝试使用其他端口（例如 ${suggestedPort}）`,
                buttons: ['我知道了', `尝试使用 ${suggestedPort}`],
                defaultId: 1,
                cancelId: 0
            });

            if (response === 1) {
                // 用户选择尝试新端口
                // 这里我们只是抛出错误让前端知道失败了，或者我们可以递归调用 startApiServer 传入新端口
                // 但为了架构简单，我们让用户在前端界面手动输入新端口会更好，
                // 不过这里为了极致体验，我们可以抛出一个带特定代码的错误，让前端填充新端口
                throw new Error(`PORT_OCCUPIED:${suggestedPort}`);
            } else {
                throw new Error(`端口 ${port} 被占用，请更换端口后重试。`);
            }
        }

        // 2. 启动服务
        await serverManager.start((log, isError) => {
            // 将日志转发给渲染进程（可选）
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('server-log', log);
            }
        }, port); // 传入端口

        // 3. 等待服务就绪
        await serverManager.waitForStart(port);

        currentApiPort = port;

        if (apiTabId) {
            closeTab(apiTabId);
            apiTabId = null;
        }

        const apiUrl = `https://127.0.0.1:${port}`;
        const result = createUrlTab(apiUrl, true, false);
        if (result.success) {
            apiTabId = result.id;
            const apiTab = tabs.get(apiTabId);
            if (apiTab) {
                apiTab.type = 'api';
            }
        }

        return { success: true };

    } catch (error) {
        console.error('Start failed:', error);
        return { success: false, error: error.message };
    }
}

// 停止 API 服务并移除视图
async function stopApiServer() {
    await serverManager.stop();
    if (apiTabId) {
        closeTab(apiTabId);
        apiTabId = null;
    }
    closeNonPinnedTabs();
    return { success: true };
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 当运行第二个实例时，焦点回到第一个实例
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        createWindow();
        createInitialTabs();

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

// 忽略自签名证书错误
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.startsWith('https://127.0.0.1') || url.startsWith('https://localhost') ||
        url.startsWith('wss://127.0.0.1') || url.startsWith('wss://localhost')) {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});

app.on('window-all-closed', async function () {
    await serverManager.stop();
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
    isQuitting = true;
    // 强制销毁所有窗口，防止有漏网之鱼（如隐藏窗口）
    BrowserWindow.getAllWindows().forEach(win => win.destroy());
    await serverManager.stop();
});

// IPC Handlers
ipcMain.on('open-file', (event, filePath) => {
    if (filePath) shell.openPath(filePath);
});

ipcMain.on('show-in-folder', (event, filePath) => {
    if (filePath) shell.showItemInFolder(filePath);
});

ipcMain.on('cancel-download', (event, startTime) => {
    const item = downloadItems.get(startTime);
    if (item) {
        if (item.getState() === 'progressing') {
            item.cancel();
        }
        downloadItems.delete(startTime);
    }
});

ipcMain.handle('tabs-activate', (_event, id) => {
    setActiveTab(id);
    return { success: true };
});

ipcMain.handle('tabs-close', (_event, id) => {
    return closeTab(id);
});

ipcMain.handle('tabs-duplicate', (_event, id) => {
    const tab = tabs.get(id);
    if (!tab || !tab.copyable || !tab.url) {
        return { success: false, error: 'NOT_COPYABLE' };
    }
    return createUrlTab(tab.url, true, false);
});

ipcMain.handle('get-config', () => {
    return configManager.loadEnv();
});

ipcMain.handle('save-config', (event, config) => {
    configManager.saveEnv(config);
    return true;
});

ipcMain.handle('reset-password', (event, { username, password }) => {
    try {
        configManager.saveAccount(username, password);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('start-server', startApiServer);

ipcMain.handle('stop-server', stopApiServer);
