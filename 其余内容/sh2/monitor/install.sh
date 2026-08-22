#!/bin/bash

set -e

# =============================================================================
# XMP 监控探针安装脚本
# =============================================================================
# 环境变量说明：
#   PORT              - 运行端口，默认 8333
#   INSTALL_DIR       - 安装目录，默认 /opt/xmp
#   CERT_PEM_B64      - cert.pem Base64 编码 (必填)
#   CERT_KEY_B64      - cert.key Base64 编码 (必填)
#   CA_PEM_B64        - ca.pem Base64 编码 (必填)
#   FIREWALL_OPEN     - 开放防火墙端口 (y/n)，默认 y
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
    error_exit "XMP 监控探针已安装 (检测到 $SERVICE_FILE)，如需重装请先卸载"
fi

# -----------------------------------------------------------------------------
# 基础检查：必填环境变量
# -----------------------------------------------------------------------------
if [ -z "$CERT_PEM_B64" ] || [ -z "$CERT_KEY_B64" ] || [ -z "$CA_PEM_B64" ]; then
    error_exit "证书环境变量未设置 (CERT_PEM_B64, CERT_KEY_B64, CA_PEM_B64)"
fi

# -----------------------------------------------------------------------------
# 设置默认值
# -----------------------------------------------------------------------------
PORT="${PORT:-8333}"
INSTALL_DIR="${INSTALL_DIR:-/opt/xmp}"
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
# 创建用户
# -----------------------------------------------------------------------------
if ! id -u xmpanel &> /dev/null; then
    echo "> 创建用户 xmpanel..."
    useradd -m -s /bin/bash xmpanel
fi

# -----------------------------------------------------------------------------
# 下载程序（多地址尝试）
# -----------------------------------------------------------------------------
echo "> 创建安装目录: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR" || error_exit "无法进入目录 $INSTALL_DIR"

echo "> 下载程序..."
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

# 设置执行权限
chmod +x xmp-monitor 2>/dev/null || true

# -----------------------------------------------------------------------------
# 写入证书
# -----------------------------------------------------------------------------
echo "> 写入证书..."
CERT_DIR="$INSTALL_DIR/cert"
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
ENV_FILE="$INSTALL_DIR/.env"
cat > "$ENV_FILE" <<EOF
PORT=$PORT
EOF

# -----------------------------------------------------------------------------
# 设置权限
# -----------------------------------------------------------------------------
echo "> 设置权限..."
chown -R xmpanel:xmpanel "$CERT_DIR"
chown xmpanel:xmpanel "$ENV_FILE"
chmod 600 "$ENV_FILE"
chmod 700 "$CERT_DIR"

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
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=XMP Monitor Service
After=network.target

[Service]
Type=simple
User=xmpanel
Group=xmpanel
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/xmp-monitor
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

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
echo " XMP 监控探针安装完成！"
echo "=========================================="
echo "安装目录: $INSTALL_DIR"
echo "服务状态: $(systemctl is-active xmp-monitor)"
echo "=========================================="
