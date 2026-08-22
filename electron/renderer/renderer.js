const btnSaveEnv = document.getElementById('btnSaveEnv');
const btnResetPass = document.getElementById('btnResetPass');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const errorMsg = document.getElementById('errorMsg');
const logOutput = document.getElementById('logOutput');
const inputPort = document.getElementById('inputPort');
const tabsContainer = document.getElementById('tabs');
const settingsPanel = document.getElementById('settingsPanel');
let currentActiveTabId = 'home';

// 加载初始配置
async function loadConfig() {
    try {
        const config = await window.electronAPI.getConfig();
        inputPort.value = config.PORT || '5008';
    } catch (err) {
        log('Error loading config: ' + err.message);
    }
}

// 保存配置
btnSaveEnv.addEventListener('click', async () => {
    const config = {
        PORT: inputPort.value,
        REVERSE_PROXY: 'false' // 强制关闭
    };
    await window.electronAPI.saveConfig(config);
    log('配置已保存');
    alert('配置已保存');
});

// 重置密码
btnResetPass.addEventListener('click', async () => {
    const username = document.getElementById('inputUser').value;
    const password = document.getElementById('inputPass').value;

    if (!username && !password) {
        alert('请输入用户名或密码');
        return;
    }

    const result = await window.electronAPI.resetPassword({ username, password });
    if (result.success) {
        log('账号/密码已重置');
        alert('账号密码修改成功');
        // 清空输入框
        document.getElementById('inputUser').value = '';
        document.getElementById('inputPass').value = '';
    } else {
        log('重置失败: ' + result.error);
        alert('失败: ' + result.error);
    }
});

// 启动服务
btnStart.addEventListener('click', async () => {
    setLoading(true);
    errorMsg.textContent = '';
    log('正在启动服务...');
    
    // 如果之前有修改过端口，临时保存一下（虽然不持久化到文件，但为了本次启动生效）
    const currentPort = inputPort.value;
    await window.electronAPI.saveConfig({ PORT: currentPort });

    const result = await window.electronAPI.startServer();
    
    setLoading(false);
    
    if (result.success) {
        setRunningState(true);
        log('服务启动成功！');
    } else {
        // 智能处理端口占用错误
        // 错误格式: PORT_OCCUPIED:5108
        if (result.error && result.error.startsWith('PORT_OCCUPIED:')) {
            const suggestedPort = result.error.split(':')[1];
            
            // 自动填入建议端口
            inputPort.value = suggestedPort;
            
            // 显示友好提示
            errorMsg.textContent = `端口占用，已为您切换到建议端口 ${suggestedPort}。请再次点击启动。`;
            log(`[提示] 端口被占用，已自动切换为 ${suggestedPort}，请重试。`);
            
            // 闪烁输入框提示用户
            inputPort.classList.add('highlight-input');
            setTimeout(() => inputPort.classList.remove('highlight-input'), 2000);
        } else {
            errorMsg.textContent = result.error;
            log('启动失败: ' + result.error);
        }
    }
});

// 停止服务
btnStop.addEventListener('click', async () => {
    const result = await window.electronAPI.stopServer();
    if (result.success) {
        setRunningState(false);
        log('服务已停止');
    }
});

// 日志监听
window.electronAPI.onServerLog((message) => {
    log(message);
});

window.electronAPI.onTabsUpdate(({ tabs, activeTabId }) => {
    currentActiveTabId = activeTabId;
    renderTabs(tabs, activeTabId);
    settingsPanel.style.display = activeTabId === 'home' ? 'block' : 'none';
});

function renderTabs(tabs, activeTabId) {
    tabsContainer.innerHTML = '';
    tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        if (tab.id === activeTabId) {
            tabEl.classList.add('active');
        }
        if (tab.flash && tab.id !== activeTabId) {
            tabEl.classList.add('flash');
        }
        tabEl.dataset.tabId = tab.id;

        const titleEl = document.createElement('div');
        titleEl.className = 'tab-title';
        titleEl.textContent = tab.title || '新页面';
        tabEl.appendChild(titleEl);

        if (!tab.pinned) {
            const actionsEl = document.createElement('div');
            actionsEl.className = 'tab-actions';

            if (tab.copyable) {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'tab-action';
                copyBtn.textContent = '复制';
                copyBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const result = await window.electronAPI.duplicateTab(tab.id);
                    if (!result.success && result.error === 'TAB_LIMIT') {
                        alert('标签数量已达上限');
                    }
                });
                actionsEl.appendChild(copyBtn);
            }

            if (tab.closable) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'tab-action';
                closeBtn.textContent = '关闭';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.electronAPI.closeTab(tab.id);
                });
                actionsEl.appendChild(closeBtn);
            }

            tabEl.appendChild(actionsEl);
        }

        tabEl.addEventListener('click', () => {
            if (tab.id !== currentActiveTabId) {
                window.electronAPI.activateTab(tab.id);
            }
        });
        tabsContainer.appendChild(tabEl);
    });
}

function log(msg) {
    const time = new Date().toLocaleTimeString();
    logOutput.textContent += `[${time}] ${msg}\n`;
    logOutput.scrollTop = logOutput.scrollHeight;
}

function setLoading(isLoading) {
    btnStart.disabled = isLoading;
    btnStart.textContent = isLoading ? '启动中...' : '启动服务';
}

function setRunningState(isRunning) {
    if (isRunning) {
        statusDot.classList.add('running');
        statusText.textContent = '运行中';
        btnStop.style.display = 'inline-flex';
        btnStart.style.display = 'none';
    } else {
        statusDot.classList.remove('running');
        statusText.textContent = '未启动';
        btnStop.style.display = 'none';
        btnStart.style.display = 'inline-flex';
    }
}

// 初始化
loadConfig();
setRunningState(false);
