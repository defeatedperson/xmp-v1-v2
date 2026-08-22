#!/bin/bash

set -e

# =============================================================================
# XMP 监控探针更新脚本
# =============================================================================
# 环境变量说明：
#   PORT              - 运行端口 (未提供则保留旧值)
#   CERT_PEM_B64      - cert.pem Base64 编码 (未提供则保留旧值)
#   CERT_KEY_B64      - cert.key Base64 编码 (未提供则保留旧值)
#   CA_PEM_B64        - ca.pem Base64 编码 (未提供则保留旧值)
# =============================================================================

SERVICE_FILE="/etc/systemd/system/xmp-monitor.service"

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
    error_exit "XMP 监控探针未安装 (未检测到 $SERVICE_FILE)，请先运行安装脚本"
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
# 停止服务
# -----------------------------------------------------------------------------
echo "> 停止服务..."
systemctl stop xmp-monitor 2>/dev/null || true

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
# 下载新程序（多地址尝试）
# -----------------------------------------------------------------------------
echo "> 下载新程序..."
cd "$INSTALL_DIR" || error_exit "无法进入目录 $INSTALL_DIR"
rm -f monitor.zip

DOWNLOAD_URLS=(
    "https://node.xmpanel.cn/v2/monitor/monitor.zip"
    "https://hk.xmp.plus/v2/monitor/monitor.zip"
)

DOWNLOAD_SUCCESS=false
for url in "${DOWNLOAD_URLS[@]}"; do
    echo "> 尝试下载: $url"
    if wget -T 15 -t 1 -O monitor.zip "$url" 2>/dev/null; then
        FILE_SIZE=$(stat -c%s monitor.zip 2>/dev/null || stat -f%z monitor.zip 2>/dev/null)
        if [ "$FILE_SIZE" -lt 5242880 ]; then
            echo "> 文件过小，尝试下一个地址"
            rm -f monitor.zip
            continue
        fi
        if head -c 512 monitor.zip | grep -qi -e "<html" -e "<!doctype"; then
            echo "> 下载内容疑似网页，尝试下一个地址"
            rm -f monitor.zip
            continue
        fi
        DOWNLOAD_SUCCESS=true
        echo "> 下载成功"
        break
    else
        echo "> 下载失败，尝试下一个地址"
        rm -f monitor.zip
    fi
done

if [ "$DOWNLOAD_SUCCESS" = false ]; then
    error_exit "所有下载地址均失败，请检查网络连接"
fi

echo "> 解压程序..."
unzip -o monitor.zip
rm -f monitor.zip

# -----------------------------------------------------------------------------
# 更新配置文件
# -----------------------------------------------------------------------------
ENV_FILE="$INSTALL_DIR/.env"

if [ -n "$PORT" ]; then
    echo "> 更新配置文件..."
    cat > "$ENV_FILE" <<EOF
PORT=$PORT
EOF
fi

# -----------------------------------------------------------------------------
# 更新证书
# -----------------------------------------------------------------------------
CERT_DIR="$INSTALL_DIR/cert"

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

chmod +x xmp-monitor 2>/dev/null || true

if [ -d "$CERT_DIR" ]; then
    chown -R xmpanel:xmpanel "$CERT_DIR"
    chmod 700 "$CERT_DIR"
    chmod 600 "$CERT_DIR/cert.key" 2>/dev/null || true
    chmod 644 "$CERT_DIR/cert.pem" "$CERT_DIR/ca.pem" 2>/dev/null || true
fi

if [ -f "$ENV_FILE" ]; then
    chown xmpanel:xmpanel "$ENV_FILE"
    chmod 600 "$ENV_FILE"
fi

# -----------------------------------------------------------------------------
# 试运行检测
# -----------------------------------------------------------------------------
echo "> 试运行检测 (约 10 秒)..."
nohup ./xmp-monitor >/dev/null 2>&1 &
PID=$!
CHECK_DURATION=10
SUCCESS=false

for ((i=1; i<=CHECK_DURATION; i++)); do
    if ! kill -0 $PID 2>/dev/null; then
        echo "> 试运行失败: 进程意外退出"
        error_exit "试运行检测失败"
    fi
    if [ $i -eq $CHECK_DURATION ]; then
        SUCCESS=true
    fi
    echo -n "."
    sleep 1
done
echo ""

kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

if [ "$SUCCESS" = false ]; then
    error_exit "试运行检测失败"
fi

# -----------------------------------------------------------------------------
# 配置 systemd 服务
# -----------------------------------------------------------------------------
echo "> 配置 systemd 服务..."
systemctl daemon-reload
systemctl enable xmp-monitor

# -----------------------------------------------------------------------------
# 启动服务
# -----------------------------------------------------------------------------
echo "> 启动服务..."
systemctl start xmp-monitor

if ! systemctl is-active --quiet xmp-monitor; then
    error_exit "服务启动失败"
fi

echo "> 服务已启动"

# -----------------------------------------------------------------------------
# 完成
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo " XMP 监控探针更新完成！"
echo "=========================================="
echo "安装目录: $INSTALL_DIR"
echo "服务状态: $(systemctl is-active xmp-monitor)"
echo "=========================================="
