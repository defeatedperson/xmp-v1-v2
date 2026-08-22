#!/bin/bash

# 定义颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 0. 基础检查
clear
echo -e "${BLUE}==========================================================${NC}"
echo -e "${YELLOW}如果是新手，强烈建议先看一下教程文档（含视频详细说明）${NC}"
echo -e "${YELLOW}地址：https://www.xmpanel.cn/wiki/install/agent${NC}"
echo -e "${BLUE}==========================================================${NC}"
echo ""

# 0.1 检查 Root 权限
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}错误: 请以 root 权限运行此脚本 (例如: sudo bash node.sh)${NC}"
  exit 1
fi

# 0.2 检查 CPU 架构
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
    echo -e "${RED}错误: 当前架构 ($ARCH) 不支持。本脚本及程序仅支持 x86_64 (amd64) 架构。${NC}"
    exit 1
fi

# 0.3 检查 Systemd
if ! command -v systemctl &> /dev/null; then
    echo -e "${RED}错误: 未检测到 Systemd。本脚本仅支持使用 Systemd 的系统。${NC}"
    exit 1
fi

# 1. 状态检测
SERVICE_FILE="/etc/systemd/system/xmp.service"
IS_INSTALLED=false
IS_RUNNING=false
DETECTED_DIR=""

if [ -f "$SERVICE_FILE" ]; then
    IS_INSTALLED=true
    # 尝试提取安装目录
    DETECTED_DIR=$(grep "WorkingDirectory" "$SERVICE_FILE" | cut -d= -f2 | xargs)
    
    if systemctl is-active --quiet xmp; then
        IS_RUNNING=true
    fi
fi

# 2. 交互菜单
echo -e "检测到环境状态："
if [ "$IS_INSTALLED" = true ]; then
    STATUS_TEXT="${GREEN}已安装${NC}"
    [ "$IS_RUNNING" = true ] && STATUS_TEXT="$STATUS_TEXT ${GREEN}(运行中)${NC}" || STATUS_TEXT="$STATUS_TEXT ${RED}(未运行)${NC}"
    echo -e "状态: $STATUS_TEXT"
    echo -e "路径: ${YELLOW}${DETECTED_DIR:-未知}${NC}"
    echo ""
    echo -e "请选择操作："
    echo -e "1. ${GREEN}更新版本${NC} (保留配置文件，仅更新程序)"
    echo -e "2. ${RED}卸载 XMP${NC} (删除程序和配置文件)"
    echo -e "3. ${YELLOW}完全重装${NC} (删除旧数据，重新安装)"
    echo -e "4. 退出"
    read -p "请输入选项 [1-4]: " ACTION
else
    echo -e "状态: ${YELLOW}未安装${NC}"
    echo ""
    echo -e "请选择操作："
    echo -e "1. ${GREEN}安装 XMP 被控端${NC}"
    echo -e "2. ${RED}卸载 XMP 被控端${NC} (清理残留)"
    echo -e "3. 退出"
    read -p "请输入选项 [1-3]: " ACTION
fi

# 规范化操作动作
# MODE: INSTALL, UPDATE, UNINSTALL, EXIT
MODE="EXIT"

if [ "$IS_INSTALLED" = true ]; then
    case "$ACTION" in
        1) MODE="UPDATE" ;;
        2) MODE="UNINSTALL" ;;
        3) MODE="INSTALL" ;; # 重装等于全新安装，但前置会清理
        *) exit 0 ;;
    esac
else
    case "$ACTION" in
        1) MODE="INSTALL" ;;
        2) MODE="UNINSTALL" ;;
        *) exit 0 ;;
    esac
fi

# 3. 执行逻辑 - 卸载
if [ "$MODE" == "UNINSTALL" ]; then
    echo -e "${RED}警告：即将卸载 XMP 被控端。${NC}"
    echo -e "此操作将执行以下动作："
    echo -e "1. 停止并禁用 xmp 服务"
    echo -e "2. 删除系统服务文件"
    echo -e "3. 删除安装目录下的所有文件 (包括配置文件)"
    echo -e "注意：此操作【不会】卸载 Docker 或删除正在运行的容器。"
    
    read -p "确认卸载？(y/n) [n]: " confirm_uninstall
    if [[ "$confirm_uninstall" != "y" ]]; then
        echo "取消卸载。"
        exit 0
    fi

    echo -e "${BLUE}> 正在停止服务...${NC}"
    systemctl stop xmp 2>/dev/null
    systemctl disable xmp 2>/dev/null

    echo -e "${BLUE}> 清理系统服务...${NC}"
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload

    echo -e "${BLUE}> 终止残留进程...${NC}"
    pkill -f xmp-daemon 2>/dev/null
    pkill -f xmp-monitor 2>/dev/null
    pkill -f node-agent 2>/dev/null

    echo -e "${BLUE}> 删除文件...${NC}"
    # 优先使用探测到的目录，如果没有则默认 /opt/xmp
    TARGET_DIR="${DETECTED_DIR:-/opt/xmp}"
    
    if [ -d "$TARGET_DIR" ]; then
        # 再次确认，防止误删根目录等意外情况
        if [[ "$TARGET_DIR" == "/" || "$TARGET_DIR" == "/root" || "$TARGET_DIR" == "/home" ]]; then
             echo -e "${RED}错误：检测到的安装目录为敏感目录 ($TARGET_DIR)，跳过自动删除，请手动清理。${NC}"
        else
            rm -rf "$TARGET_DIR"
            echo -e "${GREEN}已删除安装目录: $TARGET_DIR${NC}"
        fi
    else
        echo "目录 $TARGET_DIR 不存在，跳过删除。"
    fi

    echo -e "${GREEN}卸载完成。${NC}"
    exit 0
fi

# 4. 执行逻辑 - 安装/更新/重装
echo "准备开始..."
read -p "按回车键继续..."

# 4.1 环境检查 (Docker, JQ, 包管理器)
# 识别包管理器
echo -e "${BLUE}> 检查系统环境...${NC}"
PACKAGE_MANAGER=""
if command -v apt-get &> /dev/null; then
    PACKAGE_MANAGER="apt"
elif command -v yum &> /dev/null; then
    PACKAGE_MANAGER="yum"
elif command -v dnf &> /dev/null; then
    PACKAGE_MANAGER="dnf"
else
    echo -e "${RED}错误: 未检测到支持的包管理器 (apt/yum/dnf)。${NC}"
    exit 1
fi

# 检查 SELinux
if [[ "$PACKAGE_MANAGER" == "yum" || "$PACKAGE_MANAGER" == "dnf" ]]; then
    if command -v getenforce &> /dev/null; then
        SELINUX_STATUS=$(getenforce)
        if [ "$SELINUX_STATUS" == "Enforcing" ]; then
            echo -e "${RED}错误: 检测到 SELinux 处于 Enforcing (强制) 模式。${NC}"
            echo -e "建议: 请执行 ${GREEN}setenforce 0${NC} 临时关闭，或修改 /etc/selinux/config 永久关闭后重试。"
            exit 1
        fi
    fi
fi

# 安装基础工具
echo -e "${BLUE}> 安装基础工具 (${PACKAGE_MANAGER})...${NC}"
DEPENDENCIES="curl wget unzip"
if [ "$PACKAGE_MANAGER" == "apt" ]; then
    apt-get update -y >/dev/null 2>&1
    apt-get install -y $DEPENDENCIES >/dev/null 2>&1
elif [ "$PACKAGE_MANAGER" == "yum" ]; then
    yum install -y $DEPENDENCIES >/dev/null 2>&1
elif [ "$PACKAGE_MANAGER" == "dnf" ]; then
    dnf install -y $DEPENDENCIES >/dev/null 2>&1
fi

# 尝试安装 jq
HAS_JQ=false
if ! command -v jq &> /dev/null; then
    echo "尝试安装 JSON 处理工具 (jq)..."
    if [ "$PACKAGE_MANAGER" == "apt" ]; then
        apt-get install -y jq >/dev/null 2>&1
    elif [ "$PACKAGE_MANAGER" == "yum" ]; then
        yum install -y epel-release >/dev/null 2>&1
        yum install -y jq >/dev/null 2>&1
    elif [ "$PACKAGE_MANAGER" == "dnf" ]; then
        dnf install -y jq >/dev/null 2>&1
    fi
fi
if command -v jq &> /dev/null; then HAS_JQ=true; fi

# 检测 Docker
echo -e "${BLUE}> 检测 Docker 环境...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}未检测到 Docker 引擎。${NC}"
    read -p "当前服务器是否位于中国大陆? (y/n) [y]: " IS_CHINA
    IS_CHINA=${IS_CHINA:-y}
    if [[ "$IS_CHINA" == "y" ]]; then
        echo -e "${RED}==========================================================${NC}"
        echo -e "${YELLOW}您的服务器位于中国大陆，建议使用第三方脚本安装 Docker 并配置镜像加速。${NC}"
        echo -e "请复制以下命令并运行："
        echo -e "${GREEN}bash <(curl -sSL https://linuxmirrors.cn/docker.sh)${NC}"
        echo -e "${RED}==========================================================${NC}"
        exit 0
    else
        echo "正在安装 Docker (使用官方脚本)..."
        if curl -fsSL https://get.docker.com | bash; then
            echo -e "${GREEN}Docker 安装成功。${NC}"
            systemctl enable docker
            systemctl start docker
        else
            echo -e "${RED}Docker 安装失败。${NC}"
            exit 1
        fi
    fi
else
    echo -e "${GREEN}Docker 已安装。${NC}"
fi

# Docker 日志配置 (仅在安装/重装时提示，更新模式默认跳过除非想强制配)
# 这里简化逻辑：只要能配就检测一下，不强制
if [ "$HAS_JQ" = true ]; then
    DAEMON_JSON="/etc/docker/daemon.json"
    [ ! -f "$DAEMON_JSON" ] && echo "{}" > "$DAEMON_JSON"
    LOG_DRIVER=$(jq -r '.["log-driver"] // empty' "$DAEMON_JSON")
    if [ "$LOG_DRIVER" != "json-file" ] && [ -z "$LOG_DRIVER" ]; then
        # 仅在非 UPDATE 模式下主动询问，避免更新时打扰
        if [ "$MODE" != "UPDATE" ]; then
            echo -e "${YELLOW}建议配置 Docker 日志分割。${NC}"
            read -p "是否自动配置日志分割? (y/n) [y]: " config_log
            config_log=${config_log:-y}
            if [[ "$config_log" == "y" ]]; then
                tmp=$(mktemp)
                jq '."log-driver" = "json-file" | ."log-opts" = {"max-size": "10m", "max-file": "3"}' "$DAEMON_JSON" > "$tmp" && mv "$tmp" "$DAEMON_JSON"
                systemctl restart docker
                echo -e "${GREEN}日志配置已更新。${NC}"
            fi
        fi
    fi
fi

# 创建 Docker 网络
if ! docker network ls | grep -q "xmp-network"; then
    docker network create --driver bridge xmp-network
fi


# 4.2 准备安装参数
if [ "$MODE" == "UPDATE" ]; then
    echo -e "${BLUE}> 进入更新模式...${NC}"
    INSTALL_DIR="$DETECTED_DIR"
    
    if [ -z "$INSTALL_DIR" ] || [ ! -d "$INSTALL_DIR" ]; then
        echo -e "${RED}错误：无法检测到旧版安装目录，请尝试使用“完全重装”模式。${NC}"
        exit 1
    fi
    
    echo -e "安装目录: $INSTALL_DIR"
    # 停止旧服务
    systemctl stop xmp 2>/dev/null
    
    # 尝试加载旧配置以便后续使用 (如防火墙端口检测)
    if [ -f "$INSTALL_DIR/.env" ]; then
        source "$INSTALL_DIR/.env"
    else
        echo -e "${YELLOW}警告: 未找到 .env 配置文件，更新可能不完整。${NC}"
    fi

elif [ "$MODE" == "INSTALL" ]; then
    # 如果是重装（且已安装），先停服务清理
    if [ "$IS_INSTALLED" = true ]; then
        echo -e "${BLUE}> 正在清理旧版本...${NC}"
        systemctl stop xmp 2>/dev/null
        systemctl disable xmp 2>/dev/null
        rm -f "$SERVICE_FILE"
        systemctl daemon-reload
        # 这里的重装不强制删文件，而是覆盖，但会重新生成 .env
        # 如果需要彻底清理，用户应选“卸载”
    fi

    echo -e "${BLUE}> 配置 XMP 被控端信息${NC}"
    
    # 安装目录
    read -p "请输入安装目录（建议默认，支持卸载） [默认: /opt/xmp]: " INSTALL_DIR
    INSTALL_DIR=${INSTALL_DIR:-/opt/xmp}
    mkdir -p "$INSTALL_DIR"

    # 端口
    if [ -n "$PORT" ]; then
        PORT=$(echo "$PORT" | tr -d '[:space:]')
        if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
            echo -e "${RED}无效端口（环境变量 PORT）。${NC}"
            exit 1
        fi
    else
        while true; do
            read -p "请输入运行端口 (PORT) [默认: 3008]: " PORT
            PORT=$(echo "$PORT" | tr -d '[:space:]')
            PORT=${PORT:-3008}
            if [[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; then break; fi
            echo -e "${RED}无效端口。${NC}"
        done
    fi

    # ID
    if [ -n "$NODE_ID" ]; then
        NODE_ID=$(echo "$NODE_ID" | tr -d '[:space:]')
        if ! [[ "$NODE_ID" =~ ^[0-9]+$ ]]; then
            echo -e "${RED}节点 ID 必须是数字（环境变量 NODE_ID）。${NC}"
            exit 1
        fi
    else
        while true; do
            read -p "请输入节点 ID (NODE_ID): " NODE_ID
            NODE_ID=$(echo "$NODE_ID" | tr -d '[:space:]')
            if [[ "$NODE_ID" =~ ^[0-9]+$ ]]; then break; fi
            echo -e "${RED}节点 ID 必须是数字。${NC}"
        done
    fi

    # Key
    if [ -n "$NODE_SECRET_KEY" ]; then
        NODE_SECRET_KEY="$(echo "${NODE_SECRET_KEY}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        if [ -z "$NODE_SECRET_KEY" ]; then
            echo -e "${RED}密钥不能为空（环境变量 NODE_SECRET_KEY）。${NC}"
            exit 1
        fi
    else
        while true; do
            read -p "请输入节点密钥 (NODE_SECRET_KEY): " NODE_SECRET_KEY
            NODE_SECRET_KEY="$(echo "${NODE_SECRET_KEY}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
            if [ -n "$NODE_SECRET_KEY" ]; then break; fi
            echo -e "${RED}密钥不能为空。${NC}"
        done
    fi

    # 生成配置
    PASSWORD_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1)
    ENV_FILE="$INSTALL_DIR/.env"
    cat > "$ENV_FILE" <<EOF
# Server Configuration
PORT=$PORT

# Node Configuration
NODE_ID=$NODE_ID
NODE_SECRET_KEY="$NODE_SECRET_KEY"
PASSWORD_SECRET=$PASSWORD_SECRET
EOF
    echo -e "${GREEN}配置文件已生成。${NC}"
fi


# 4.3 下载与部署
echo -e "${BLUE}> 下载被控端程序...${NC}"
cd "$INSTALL_DIR" || exit 1
rm -f node.zip

read -p "当前服务器是否位于中国大陆? (y/n) [y]: " IS_CHINA
IS_CHINA=${IS_CHINA:-y}
DOWNLOAD_URLS_CN=(
    "https://node.xmpanel.cn/v1/node/node.zip"
    "https://hk.xmp.plus/v1/node/node.zip"
)
DOWNLOAD_URLS_GLOBAL=(
    "https://node.xmpanel.cn/v1/node/node.zip"
    "https://hk.xmp.plus/v1/node/node.zip"
)
if [[ "$IS_CHINA" == "y" ]]; then
    BASE_URLS=("${DOWNLOAD_URLS_CN[@]}")
else
    BASE_URLS=("${DOWNLOAD_URLS_GLOBAL[@]}")
fi
RANDOM_INDEX=$((RANDOM % ${#BASE_URLS[@]}))
FIRST_URL="${BASE_URLS[$RANDOM_INDEX]}"
DOWNLOAD_URLS=("$FIRST_URL")
for url in "${BASE_URLS[@]}"; do
    if [ "$url" != "$FIRST_URL" ]; then
        DOWNLOAD_URLS+=("$url")
    fi
done
DOWNLOAD_SUCCESS=false
MIN_SIZE=$((30 * 1024 * 1024))

for url in "${DOWNLOAD_URLS[@]}"; do
    for attempt in 1 2; do
        echo -e "${BLUE}> 尝试下载: $url (第${attempt}次)...${NC}"
        if wget -T 15 -t 2 -O node.zip "$url"; then
            FILE_SIZE=$(stat -c%s node.zip)
            if [ "$FILE_SIZE" -ge "$MIN_SIZE" ]; then
                if head -c 512 node.zip | grep -qi -e "<html" -e "<!doctype"; then
                    echo -e "${YELLOW}下载内容疑似为网页，准备重试...${NC}"
                    rm -f node.zip
                else
                    DOWNLOAD_SUCCESS=true
                    break
                fi
            else
                echo -e "${YELLOW}下载文件校验失败(过小)，准备重试...${NC}"
                rm -f node.zip
            fi
        fi
    done
    [ "$DOWNLOAD_SUCCESS" = true ] && break
done

if [ "$DOWNLOAD_SUCCESS" = false ]; then
    echo -e "${RED}错误: 所有下载节点均不可用，建议查看文档，地址：https://www.xmpanel.cn/wiki/install/agent${NC}"
    exit 1
fi

echo "正在解压..."
unzip -o node.zip >/dev/null
rm -f node.zip

# 目录结构调整
if [ ! -f "xmp-daemon" ] && [ -d "node" ] && [ -f "node/xmp-daemon" ]; then
    mv node/* .
    rmdir node
fi

chmod +x xmp-daemon xmp-monitor node-agent


# 4.4 试运行
echo -e "${BLUE}> 正在进行试运行检测 (约 20 秒)...${NC}"
mkdir -p "$INSTALL_DIR/data/log"
nohup ./xmp-daemon >/dev/null 2>&1 &
PID=$!
CHECK_DURATION=20
LOG_FILE="$INSTALL_DIR/data/log/daemon.log"
SUCCESS=false

for ((i=1; i<=CHECK_DURATION; i++)); do
    if ! kill -0 $PID 2>/dev/null; then
        echo -e "${RED}试运行失败: 进程意外退出。${NC}"
        break
    fi
    if [ -f "$LOG_FILE" ]; then
        if tail -n 20 "$LOG_FILE" | grep -q "服务已启动: node-agent"; then
            SUCCESS=true
            break
        fi
        if tail -n 20 "$LOG_FILE" | grep -E -q "失败|Error|error|Panic|panic"; then
            echo -e "${RED}检测到日志报错。${NC}"
            break
        fi
    fi
    echo -n "."
    sleep 1
done
echo ""

kill $PID 2>/dev/null
wait $PID 2>/dev/null

if [ "$SUCCESS" = false ]; then
    echo -e "${RED}启动失败，请检查日志：$LOG_FILE${NC}"
    if [ -f "$LOG_FILE" ]; then tail -n 10 "$LOG_FILE"; fi
    exit 1
fi


# 4.5 配置服务
echo -e "${BLUE}> 配置系统服务...${NC}"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=XMP Daemon Service
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/xmp-daemon
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable xmp
systemctl start xmp

if ! systemctl is-active --quiet xmp; then
    echo -e "${RED}服务启动失败。${NC}"
    exit 1
fi
echo -e "${GREEN}服务已启动。${NC}"


# 4.6 防火墙
echo -e "${BLUE}> 检测防火墙配置...${NC}"
# 如果是 Update 模式，且之前读到了 PORT，或者 Install 模式有 PORT
if [ -n "$PORT" ]; then
    if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
        if [ "$MODE" == "UPDATE" ]; then
             # 更新模式下，也许不需要问，直接确认是否已开，没开则开
             ufw allow "$PORT"/tcp >/dev/null
             echo -e "${GREEN}端口 $PORT 规则已更新(UFW)。${NC}"
        else
            read -p "是否开放端口 $PORT? (y/n) [y]: " config_fw
            if [[ "${config_fw:-y}" == "y" ]]; then
                ufw allow "$PORT"/tcp
                echo -e "${GREEN}端口 $PORT 已开放。${NC}"
            fi
        fi
    elif command -v firewall-cmd &> /dev/null && firewall-cmd --state | grep -q "running"; then
        if [ "$MODE" == "UPDATE" ]; then
             firewall-cmd --zone=public --add-port="$PORT"/tcp --permanent >/dev/null 2>&1
             firewall-cmd --reload >/dev/null 2>&1
             echo -e "${GREEN}端口 $PORT 规则已更新(Firewalld)。${NC}"
        else
            read -p "是否开放端口 $PORT? (y/n) [y]: " config_fw
            if [[ "${config_fw:-y}" == "y" ]]; then
                firewall-cmd --zone=public --add-port="$PORT"/tcp --permanent >/dev/null
                firewall-cmd --reload >/dev/null
                echo -e "${GREEN}端口 $PORT 已开放。${NC}"
            fi
        fi
    fi
fi

# 5. 完成
echo ""
echo -e "${BLUE}==========================================================${NC}"
if [ "$MODE" == "UPDATE" ]; then
    echo -e "${GREEN} XMP 被控端更新完成！${NC}"
else
    echo -e "${GREEN} XMP 被控端安装完成！${NC}"
fi
echo -e "${BLUE}==========================================================${NC}"
echo -e "请前往主控页面: ${YELLOW}节点管理 -> 找到目标节点 -> 点击操作 -> 更新 RSA${NC}"
echo -e "(如果是首次使用主控，直接点击节点管理页面的 RSA 更新按钮即可)"
echo ""
echo -e "更多帮助请访问: https://www.xmpanel.cn/wiki/install/agent"
echo -e "${BLUE}==========================================================${NC}"
