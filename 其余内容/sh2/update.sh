#!/bin/bash

set -e

# =============================================================================
# XMP 被控端更新脚本
# =============================================================================
# 环境变量说明：
#   NODE_ID           - 节点ID (未提供则保留旧值)
#   PORT              - 运行端口 (未提供则保留旧值)
#   CERT_PEM_B64      - cert.pem Base64 编码 (未提供则保留旧值)
#   CERT_KEY_B64      - cert.key Base64 编码 (未提供则保留旧值)
#   CA_PEM_B64        - ca.pem Base64 编码 (未提供则保留旧值)
#   DOCKER_MIRROR     - 配置镜像加速 (y/n)，默认 n
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
# 检测 root 权限
# -----------------------------------------------------------------------------
if [ "$EUID" -ne 0 ]; then
    error_exit "请以 root 权限运行此脚本 (例如: sudo bash update.sh)"
fi

# -----------------------------------------------------------------------------
# 检测服务是否存在
# -----------------------------------------------------------------------------
if [ ! -f "$SERVICE_FILE" ]; then
    error_exit "XMP 未安装 (未检测到 $SERVICE_FILE)，请先运行安装脚本"
fi

# -----------------------------------------------------------------------------
# 获取安装目录
# -----------------------------------------------------------------------------
INSTALL_DIR=$(grep "WorkingDirectory" "$SERVICE_FILE" | cut -d= -f2 | xargs)

if [ -z "$INSTALL_DIR" ] || [ ! -d "$INSTALL_DIR" ]; then
    error_exit "无法获取安装目录，请检查服务配置"
fi

echo "> 安装目录: $INSTALL_DIR"

# -----------------------------------------------------------------------------
# 设置默认值
# -----------------------------------------------------------------------------
DOCKER_MIRROR="${DOCKER_MIRROR:-n}"

# -----------------------------------------------------------------------------
# 停止服务
# -----------------------------------------------------------------------------
echo "> 停止服务..."
systemctl stop xmp 2>/dev/null || true

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
# 配置 Docker 镜像加速
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
# 下载新程序（多地址尝试）
# -----------------------------------------------------------------------------
echo "> 下载新程序..."
cd "$INSTALL_DIR" || error_exit "无法进入目录 $INSTALL_DIR"
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

# -----------------------------------------------------------------------------
# 更新配置文件
# -----------------------------------------------------------------------------
ENV_FILE="$INSTALL_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
fi

if [ -n "$NODE_ID" ] || [ -n "$PORT" ]; then
    echo "> 更新配置文件..."

    CURRENT_PORT="${PORT:-$CURRENT_PORT}"
    CURRENT_NODE_ID="${NODE_ID:-$NODE_ID}"
    CURRENT_PASSWORD_SECRET="${PASSWORD_SECRET}"

    if [ -z "$CURRENT_PASSWORD_SECRET" ]; then
        CURRENT_PASSWORD_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1)
    fi

    cat > "$ENV_FILE" <<EOF
PORT=$CURRENT_PORT
NODE_ID=$CURRENT_NODE_ID
PASSWORD_SECRET=$CURRENT_PASSWORD_SECRET
EOF
fi

# -----------------------------------------------------------------------------
# 更新证书
# -----------------------------------------------------------------------------
CERT_DIR="$INSTALL_DIR/data/cert"

if [ -n "$CERT_PEM_B64" ] || [ -n "$CERT_KEY_B64" ] || [ -n "$CA_PEM_B64" ]; then
    echo "> 更新证书..."
    mkdir -p "$CERT_DIR"

    if [ -n "$CERT_PEM_B64" ]; then
        printf "%s" "$CERT_PEM_B64" | base64 -d > "$CERT_DIR/cert.pem"
    fi
    if [ -n "$CERT_KEY_B64" ]; then
        printf "%s" "$CERT_KEY_B64" | base64 -d > "$CERT_DIR/cert.key"
    fi
    if [ -n "$CA_PEM_B64" ]; then
        printf "%s" "$CA_PEM_B64" | base64 -d > "$CERT_DIR/ca.pem"
    fi
fi

# -----------------------------------------------------------------------------
# 修复权限
# -----------------------------------------------------------------------------
echo "> 修复权限..."

chmod +x xmp-daemon xmp-monitor node-agent 2>/dev/null || true

if [ -d "$CERT_DIR" ]; then
    chown -R xmpanel:xmpanel "$CERT_DIR"
    chmod 600 "$CERT_DIR/cert.key" 2>/dev/null || true
    chmod 644 "$CERT_DIR/cert.pem" "$CERT_DIR/ca.pem" 2>/dev/null || true
fi

if [ -f "$ENV_FILE" ]; then
    chown xmpanel:xmpanel "$ENV_FILE"
    chmod 640 "$ENV_FILE"
fi

# -----------------------------------------------------------------------------
# 试运行检测
# -----------------------------------------------------------------------------
LOG_FILE="$INSTALL_DIR/data/log/daemon.log"

rm -f "$LOG_FILE" 2>/dev/null || true

echo "> 试运行检测 (约 20 秒)..."
nohup ./xmp-daemon >/dev/null 2>&1 &
PID=$!
CHECK_DURATION=20
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
# 完成
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo " XMP 被控端更新完成！"
echo "=========================================="
echo "安装目录: $INSTALL_DIR"
echo "服务状态: $(systemctl is-active xmp)"
echo "=========================================="
