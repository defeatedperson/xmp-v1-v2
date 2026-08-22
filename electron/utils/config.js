const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { app } = require('electron'); // 引入 electron app 获取路径

class ConfigManager {
    constructor(appPath) {
        // apiDir 依然指向安装目录，因为 API 代码在那里
        this.apiDir = path.join(appPath, 'api');
        
        // 废弃 .env 读写（端口由 Electron 启动时注入，不再持久化）
        // account.json 移至 AppData 目录下，实现数据分离
        this.userDataDir = app.getPath('userData');
        this.accountFile = path.join(this.userDataDir, 'data', 'account.json');
        
        // 使用 config.json 持久化存储 Electron 端配置（如端口）
        this.configFile = path.join(this.userDataDir, 'config.json');
        
        console.log('[Config] API Directory:', this.apiDir);
        console.log('[Config] User Data Directory:', this.userDataDir);
    }

    getApiDir() {
        return this.apiDir;
    }

    // loadEnv 从 config.json 读取配置
    loadEnv() {
        if (fs.existsSync(this.configFile)) {
            try {
                const config = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
                // 确保有默认值
                return {
                    PORT: '5008',
                    REVERSE_PROXY: 'false',
                    ...config
                };
            } catch (e) {
                console.error('[Config] Failed to parse config file:', e);
            }
        }
        return {
            PORT: '5008',
            REVERSE_PROXY: 'false'
        };
    }

    // saveEnv 持久化到 config.json
    saveEnv(newConfig) {
        // 读取现有配置，合并新配置
        const currentConfig = this.loadEnv();
        const configToSave = { ...currentConfig, ...newConfig };
        
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(configToSave, null, 2), 'utf-8');
            console.log('[Config] Configuration saved to:', this.configFile);
        } catch (e) {
            console.error('[Config] Failed to save config file:', e);
        }
    }

    loadAccount() {
        if (fs.existsSync(this.accountFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.accountFile, 'utf-8'));
            } catch (e) {
                console.error('[Config] Failed to parse account file:', e);
            }
        }
        // 如果 AppData 下没有，不回退读取安装目录，确保单一数据源
        return { username: "", password: "" };
    }

    saveAccount(username, password) {
        // 验证输入格式 (参考 Python 逻辑: 字母、数字、逗号、点)
        const regex = /^[a-zA-Z0-9,.]+$/;
        if (username && !regex.test(username)) throw new Error("用户名格式错误");
        if (password && !regex.test(password)) throw new Error("密码格式错误");

        // 确保 AppData/data 目录存在
        const dataDir = path.dirname(this.accountFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // 读取现有配置或创建新对象
        let data = this.loadAccount();
        
        if (username) {
            data.username = bcrypt.hashSync(username, 10);
        }
        if (password) {
            data.password = bcrypt.hashSync(password, 10);
        }
        
        // 清空 totpSecret (参考 Python 逻辑)
        data.totpSecret = "";

        fs.writeFileSync(this.accountFile, JSON.stringify(data, null, 2), 'utf-8');
        console.log('[Config] Account saved to:', this.accountFile);
    }
}

module.exports = ConfigManager;
