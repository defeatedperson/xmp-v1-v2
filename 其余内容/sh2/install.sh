#!/bin/bash

set -e

# =============================================================================
# XMP 被控端安装脚本
# =============================================================================
# 环境变量说明：
#   NODE_ID           - 节点ID (必填)
#   PORT              - 运行端口，默认 3008
#   INSTALL_DIR       - 安装目录，默认 /opt/xmp
#   CERT_PEM_B64      - cert.pem Base64 编码 (必填)
#   CERT_KEY_B64      - cert.key Base64 编码 (必填)
#   CA_PEM_B64        - ca.pem Base64 编码 (必填)
#   AUTO_INSTALL_DOCKER - 未安装Docker时自动安装 (y/n)，默认 n
#   DOCKER_MIRROR     - 配置镜像加速 (y/n)，默认 n
#   DOCKER_LOG_SPLIT  - 配置日志分割 (y/n)，默认 y
#   FIREWALL_OPEN     - 开放防火墙端口 (y/n)，默认 y
# =============================================================================

SERVICE_FILE="/etc/systemd/system/xmp.service"

# -----------------------------------------------------------------------------
# 错误退出函数
# -----------------------------------------------------------------------------
error_exit() {
    echo "错误: $1" >&2
    exit 1
}

# -----------------------------------------------------------------------------
# 基础检查：root 权限
# -----------------------------------------------------------------------------
if [ "$EUID" -ne 0 ]; then
    error_exit "请以 root 权限运行此脚本 (例如: sudo bash install.sh)"
fi

# -----------------------------------------------------------------------------
# 基础检查：架构
# -----------------------------------------------------------------------------
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
    error_exit "当前架构 ($ARCH) 不支持，仅支持 x86_64 (amd64)"
fi

# -----------------------------------------------------------------------------
# 基础检查：systemd
# -----------------------------------------------------------------------------
if ! command -v systemctl &> /dev/null; then
    error_exit "未检测到 Systemd，本脚本仅支持使用 Systemd 的系统"
fi

# -----------------------------------------------------------------------------
# 基础检查：服务是否已存在
# -----------------------------------------------------------------------------
if [ -f "$SERVICE_FILE" ]; then
    error_exit "XMP 已安装 (检测到 $SERVICE_FILE)，如需重装请先卸载"
fi

# -----------------------------------------------------------------------------
# 基础检查：必填环境变量
# -----------------------------------------------------------------------------
if [ -z "$NODE_ID" ]; then
    error_exit "环境变量 NODE_ID 未设置 (必填)"
fi

if [ -z "$CERT_PEM_B64" ] || [ -z "$CERT_KEY_B64" ] || [ -z "$CA_PEM_B64" ]; then
    error_exit "证书环境变量未设置 (CERT_PEM_B64, CERT_KEY_B64, CA_PEM_B64)"
fi

# -----------------------------------------------------------------------------
# 设置默认值
# -----------------------------------------------------------------------------
PORT="${PORT:-3008}"
INSTALL_DIR="${INSTALL_DIR:-/opt/xmp}"
AUTO_INSTALL_DOCKER="${AUTO_INSTALL_DOCKER:-n}"
DOCKER_MIRROR="${DOCKER_MIRROR:-n}"
DOCKER_LOG_SPLIT="${DOCKER_LOG_SPLIT:-y}"
FIREWALL_OPEN="${FIREWALL_OPEN:-y}"

# -----------------------------------------------------------------------------
# 安装基础工具
# -----------------------------------------------------------------------------
echo "> 安装基础工具..."
PACKAGE_MANAGER=""
if command -v apt-get &> /dev/null; then
    PACKAGE_MANAGER="apt"
elif command -v yum &> /dev/null; then
    PACKAGE_MANAGER="yum"
elif command -v dnf &> /dev/null; then
    PACKAGE_MANAGER="dnf"
fi

if [ -n "$PACKAGE_MANAGER" ]; then
    if [ "$PACKAGE_MANAGER" = "apt" ]; then
        apt-get update -y >/dev/null 2>&1 || true
        apt-get install -y jq curl wget unzip >/dev/null 2>&1 || true
    elif [ "$PACKAGE_MANAGER" = "yum" ]; then
        yum install -y jq curl wget unzip >/dev/null 2>&1 || true
    elif [ "$PACKAGE_MANAGER" = "dnf" ]; then
        dnf install -y jq curl wget unzip >/dev/null 2>&1 || true
    fi
fi

# -----------------------------------------------------------------------------
# 检测 Docker
# -----------------------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    if [ "$AUTO_INSTALL_DOCKER" = "y" ]; then
        echo "> 未检测到 Docker，正在安装..."
        if curl -fsSL https://get.docker.com | bash; then
            echo "> Docker 安装完成"
        else
            error_exit "Docker 安装失败"
        fi
    else
        error_exit "未检测到 Docker，且 AUTO_INSTALL_DOCKER 未设置为 y"
    fi
fi

# 再次检测 Docker 命令是否存在
if ! command -v docker &> /dev/null; then
    error_exit "Docker 命令不可用"
fi

echo "> Docker 已安装"

# -----------------------------------------------------------------------------
# 配置 Docker：镜像加速
# -----------------------------------------------------------------------------
if [ "$DOCKER_MIRROR" = "y" ]; then
    echo "> 配置 Docker 镜像加速..."
    DAEMON_JSON="/etc/docker/daemon.json"
    [ ! -f "$DAEMON_JSON" ] && echo "{}" > "$DAEMON_JSON"

    if command -v jq &> /dev/null; then
        if ! jq -e '.["registry-mirrors"] | index("https://docker.1ms.run")' "$DAEMON_JSON" &>/dev/null; then
            tmp=$(mktemp)
            jq '."registry-mirrors" = ["https://docker.1ms.run"]' "$DAEMON_JSON" > "$tmp" && mv "$tmp" "$DAEMON_JSON"
            systemctl restart docker
            echo "> 镜像加速已配置"
        else
            echo "> 镜像加速已配置 (跳过)"
        fi
    else
        echo "> 未安装 jq，跳过镜像加速配置"
    fi
fi

# -----------------------------------------------------------------------------
# 配置 Docker：日志分割
# -----------------------------------------------------------------------------
if [ "$DOCKER_LOG_SPLIT" = "y" ]; then
    echo "> 配置 Docker 日志分割..."
    DAEMON_JSON="/etc/docker/daemon.json"
    [ ! -f "$DAEMON_JSON" ] && echo "{}" > "$DAEMON_JSON"

    if command -v jq &> /dev/null; then
        LOG_DRIVER=$(jq -r '.["log-driver"] // empty' "$DAEMON_JSON")
        if [ "$LOG_DRIVER" != "json-file" ] && [ -z "$LOG_DRIVER" ]; then
            tmp=$(mktemp)
            jq '."log-driver" = "json-file" | ."log-opts" = {"max-size": "10m", "max-file": "3"}' "$DAEMON_JSON" > "$tmp" && mv "$tmp" "$DAEMON_JSON"
            systemctl restart docker
            echo "> 日志分割已配置"
        else
            echo "> 日志分割已配置 (跳过)"
        fi
    else
        echo "> 未安装 jq，跳过日志分割配置"
    fi
fi

# -----------------------------------------------------------------------------
# 创建网桥
# -----------------------------------------------------------------------------
if ! docker network ls | grep -q "xmp-network"; then
    echo "> 创建 xmp-network 网桥..."
    docker network create --driver bridge xmp-network
fi

# -----------------------------------------------------------------------------
# 创建用户
# -----------------------------------------------------------------------------
if ! id -u xmpanel &> /dev/null; then
    echo "> 创建用户 xmpanel..."
    useradd -m -s /bin/bash xmpanel
fi

# 将用户添加到 docker 组
if getent group docker >/dev/null 2>&1; then
    usermod -aG docker xmpanel
fi

# -----------------------------------------------------------------------------
# 下载程序（多地址尝试）
# -----------------------------------------------------------------------------
echo "> 创建安装目录: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR" || error_exit "无法进入目录 $INSTALL_DIR"

echo "> 下载程序..."
rm -f node.zip

DOWNLOAD_URLS=(
    "https://node.xmpanel.cn/v2/node/node.zip"
    "https://hk.xmp.plus/v2/node/node.zip"
)

DOWNLOAD_SUCCESS=false
for url in "${DOWNLOAD_URLS[@]}"; do
    echo "> 尝试下载: $url"
    if wget -T 15 -t 1 -O node.zip "$url" 2>/dev/null; then
        FILE_SIZE=$(stat -c%s node.zip 2>/dev/null || stat -f%z node.zip 2>/dev/null)
        if [ "$FILE_SIZE" -lt 10485760 ]; then
            echo "> 文件过小，尝试下一个地址"
            rm -f node.zip
            continue
        fi
        if head -c 512 node.zip | grep -qi -e "<html" -e "<!doctype"; then
            echo "> 下载内容疑似网页，尝试下一个地址"
            rm -f node.zip
            continue
        fi
        DOWNLOAD_SUCCESS=true
        echo "> 下载成功"
        break
    else
        echo "> 下载失败，尝试下一个地址"
        rm -f node.zip
    fi
done

if [ "$DOWNLOAD_SUCCESS" = false ]; then
    error_exit "所有下载地址均失败，请检查网络连接"
fi

echo "> 解压程序..."
unzip -o node.zip
rm -f node.zip

# 移动文件到根目录
if [ ! -f "xmp-daemon" ] && [ -d "node" ] && [ -f "node/xmp-daemon" ]; then
    mv node/* .
    rmdir node
fi

# 设置执行权限
chmod +x xmp-daemon xmp-monitor node-agent 2>/dev/null || true

# -----------------------------------------------------------------------------
# 写入证书
# -----------------------------------------------------------------------------
echo "> 写入证书..."
CERT_DIR="$INSTALL_DIR/data/cert"
mkdir -p "$CERT_DIR"

printf "%s" "$CERT_PEM_B64" | base64 -d > "$CERT_DIR/cert.pem"
printf "%s" "$CERT_KEY_B64" | base64 -d > "$CERT_DIR/cert.key"
printf "%s" "$CA_PEM_B64" | base64 -d > "$CERT_DIR/ca.pem"

chmod 600 "$CERT_DIR/cert.key"
chmod 644 "$CERT_DIR/cert.pem" "$CERT_DIR/ca.pem"

# -----------------------------------------------------------------------------
# 生成配置文件
# -----------------------------------------------------------------------------
echo "> 生成配置文件..."
PASSWORD_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1)
ENV_FILE="$INSTALL_DIR/.env"
cat > "$ENV_FILE" <<EOF
PORT=$PORT
NODE_ID=$NODE_ID
PASSWORD_SECRET=$PASSWORD_SECRET
EOF

# -----------------------------------------------------------------------------
# 设置权限
# -----------------------------------------------------------------------------
echo "> 设置权限..."
mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/data/log"
chown -R xmpanel:xmpanel "$INSTALL_DIR/data"
chown xmpanel:xmpanel "$ENV_FILE"
chmod 640 "$ENV_FILE"

# -----------------------------------------------------------------------------
# 试运行检测
# -----------------------------------------------------------------------------
echo "> 试运行检测 (约 20 秒)..."
nohup ./xmp-daemon >/dev/null 2>&1 &
PID=$!
CHECK_DURATION=20
LOG_FILE="$INSTALL_DIR/data/log/daemon.log"
SUCCESS=false

for ((i=1; i<=CHECK_DURATION; i++)); do
    if ! kill -0 $PID 2>/dev/null; then
        echo "> 试运行失败: 进程意外退出"
        if [ -f "$LOG_FILE" ]; then
            tail -n 10 "$LOG_FILE"
        fi
        error_exit "试运行检测失败"
    fi

    if [ -f "$LOG_FILE" ]; then
        if tail -n 20 "$LOG_FILE" | grep -q "服务意外退出"; then
            echo "> 服务启动失败: 意外退出"
            if [ -f "$LOG_FILE" ]; then
                tail -n 10 "$LOG_FILE"
            fi
            error_exit "试运行检测失败"
        fi

        if tail -n 20 "$LOG_FILE" | grep -q "服务已启动: node-agent"; then
            SUCCESS=true
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
    if [ -f "$LOG_FILE" ]; then
        tail -n 10 "$LOG_FILE"
    fi
    error_exit "试运行检测失败"
fi

# -----------------------------------------------------------------------------
# 配置 systemd 服务
# -----------------------------------------------------------------------------
echo "> 配置 systemd 服务..."
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

# -----------------------------------------------------------------------------
# 启动服务
# -----------------------------------------------------------------------------
echo "> 启动服务..."
systemctl start xmp

if ! systemctl is-active --quiet xmp; then
    error_exit "服务启动失败"
fi

echo "> 服务已启动"

# -----------------------------------------------------------------------------
# 配置防火墙
# -----------------------------------------------------------------------------
if [ "$FIREWALL_OPEN" = "y" ]; then
    echo "> 配置防火墙端口..."

    if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
        ufw allow "$PORT"/tcp >/dev/null 2>&1 || true
        echo "> 端口 $PORT 已开放 (UFW)"
    elif command -v firewall-cmd &> /dev/null && firewall-cmd --state 2>/dev/null | grep -q "running"; then
        firewall-cmd --zone=public --add-port="$PORT"/tcp --permanent >/dev/null 2>&1 || true
        firewall-cmd --reload >/dev/null 2>&1 || true
        echo "> 端口 $PORT 已开放 (Firewalld)"
    fi
fi

# -----------------------------------------------------------------------------
# 完成
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo " XMP 被控端安装完成！"
echo "=========================================="
echo "安装目录: $INSTALL_DIR"
echo "服务状态: $(systemctl is-active xmp)"
echo "=========================================="
