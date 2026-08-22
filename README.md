# 星梦面板 · XMP

一个分布式服务器管理系统。

> **重要提示（请先阅读）**
>
> - 本仓库开源的是 **v1 / v2 旧版**，**最新版本为 v3 系列**。新版（星梦面板 v3）已改用 **Go（被控端）+ Electron + Vite（主控端）** 的技术栈开发并上线，官方网站：**https://xmpanel.cn**
> - 本仓库已归档，不再维护与更新。开源目的主要是：记录历史实现、回应对用户的开放承诺、供学习与参考。新版本仅继承了本系统的设计理念，代码与开发语言已完全不同。
> - **请知悉**：本版本代码质量一般，可能存在尚未修复的 bug，部分实现不符合最佳实践，**仅供思路借鉴**。如需部署使用，强烈建议使用最新 v3 系列。

---

## 目录结构

顶层目录按「主控端 / 被控端 / 资源配置 / 文档」逻辑分组（保留物理相对路径，不做目录移动）：

```
xmp/
├── 主控端
│   ├── electron/          # 主控桌面壳（Electron 应用，入口 package.json）
│   ├── vue/               # 主控前端（Vue 3 + Vite）
│   └── api/               # 主控后端（Node.js，HTTPS + mTLS，被 master 侧 fork 启动）
│
├── 被控端
│   ├── node/              # 被控 agent（Node.js）
│   ├── 守护进程/           # 被控守护进程（Go）
│   ├── 监控探针/           # 被控监控探针（Go）
│   └── xcc-lite/          # CC 防护服务（Go）
│
├── 资源配置
│   ├── 软件商店相关/        # 应用商店 Docker / OpenResty / Lua 资源
│   ├── 其余内容/
│   │   ├── sh/            # 被控端功能脚本（firewall / monitor / node / xcc）
│   │   ├── sh2/           # 被控端 安装 / 卸载 / 更新 脚本（含 monitor、xcc 各一套）
│   │   └── store.json     # 软件商店应用目录定义（应用、镜像、端口、卷映射）
│
├── 品牌与辅助
│   └── ico/               # 品牌图标
│
├── package.json           # Electron 应用构建/启动入口
├── LICENSE                # 代码授权（Apache-2.0）
└── NOTICE                 # 商标声明 + 第三方依赖清单
```

架构上，主控 Electron 通过 fork `api/server.js` 启动主控后端，并以 mTLS 双向认证连接被控端 agent（`node/`）；`守护进程`、`监控探针`、`xcc-lite` 部署在被控/边缘侧。

---

## 技术栈

| 模块 | 技术 |
|------|------|
| 主控 | Electron / Vue 3 / Node.js (Express) |
| 被控 | Node.js agent / Go 守护进程 / Go 监控探针 / Go CC 防护 |
| 通信 | HTTPS + mTLS 双向证书认证 |
| 存储 | 各模块数据均于运行时在本地 `data/` 自举生成 |

---

## 环境要求

- Node.js：`^20.19.0 || >=22.12.0`（vue 模块要求，见 `vue/package.json`）
- Go：`1.24.1`（守护进程 / 监控探针 / xcc-lite，见各 `go.mod`）
- 前端构建产物输出到 `api/html/`。

---

## 运行 / 构建

各模块均为独立 npm / Go 工程，进入对应目录后分别安装与启动。

> 所有模块都不会因缺失运行数据而阻塞：证书、节点数据、日志、网站配置等都会在首次运行时自动生成。

### 1. 主控前端（vue/）

```bash
cd vue
npm install
npm run dev          # Vite dev server，默认 http://127.0.0.1:8889
```

`vite.config.js` 已将 `/api` 请求代理到主控后端，开发时请确保主控后端（api）已启动。

### 2. 主控后端（api/）

```bash
cd api
npm install
cp .env.example .env   # 按需修改端口等
npm run start          # 或：node server.js
```

- 首次启动会自动生成 SSL 证书与 CA、初始化默认账户、准备节点/待办数据存储。
- **默认登录账密（首次）**：用户名 `admin`，密码 `admin`。登录后请立即在「账号设置」中修改，避免安全隐患。（默认账密在 `api/function/basic/login/login.js` 中硬编码定义。）
- 若仅开发前端，后端默认端口需与 `vue/vite.config.js` 的代理目标一致。

### 3. 主控桌面壳（根目录 / electron）

```bash
npm install
npm start              # 启动 Electron 桌面应用
npm run build          # electron-builder 打包（输出到 release/）
```

桌面壳会 fork 启动 `api/server.js` 并注入数据目录与端口，无需手动启动主控后端。

### 4. 被控 agent（node/）

```bash
cd node
npm install
cp .env.example .env   # 必填：配置 NODE_ID 等
```

**注意**：被控 agent 通过 mTLS 与主控通信，需先在 `node/data/cert/` 放置由主控端下发的三份证书（`cert.pem`、`cert.key`、`ca.pem`），否则启动会因证书缺失而停止。启动：

```bash
npm run start
```

### 5. Go 模块（守护进程 / 监控探针 / xcc-lite）

```bash
# 进入对应目录
go build .   # 或 go run main.go
```

各 Go 模块目录内附有独立的技术说明文档。

### 6. 被控端部署脚本（其余内容/sh、其余内容/sh2）

`其余内容/` 下是部署被控端时所用的 Linux Shell 脚本：

- `sh/`：按功能拆分的脚本（`node.sh`、`firewall.sh`、`monitor.sh`、`xcc.sh`），可组合执行。
- `sh2/`：安装 / 卸载 / 更新一体脚本（`install.sh`、`uninstall.sh`、`update.sh`），并为 `monitor/`、`xcc/` 各提供一套。

脚本需以 `root` 运行、仅支持 `x86_64` 架构与 Systemd 系统；会检测环境、生成 `.env`、下载解压被控程序并注册 `xmp` systemd 服务。

---

## License 与商标

- **代码**：本仓库代码依据 [Apache License 2.0](LICENSE) 授权。
- **商标**：「XMP」名称、logo 及相关品牌元素为作者原创并持续使用，**不随本仓库代码开源授权**，未经作者书面许可不得用于任何用途。详见 [NOTICE](NOTICE)。
- **第三方组件**：本仓库依赖的第三方库清单与协议见 [NOTICE](NOTICE)。

---

## 历史与新版本

- **本仓库** = 星梦面板（XMP）**v1 / v2 旧版**，仅供归档、学习与思路借鉴。
- **最新版本** = **v3 系列**（星梦面板），全新技术栈（Go + Electron + Vite）开发，官方网站：https://xmpanel.cn

如需了解、下载或使用最新版本，请访问官网或联系作者。当前开源仓库不提供 v3 相关源码。
