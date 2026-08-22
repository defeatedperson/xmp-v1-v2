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
echo -e "${YELLOW}地址：https://www.xmpanel.cn/wiki/install/monitor${NC}"
echo -e "${BLUE}==========================================================${NC}"
echo ""

# 0.1 检查 Root 权限
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}错误: 请以 root 权限运行此脚本 (例如: sudo bash monitor.sh)${NC}"
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
SERVICE_FILE="/etc/systemd/system/xmp-monitor.service"
IS_INSTALLED=false
IS_RUNNING=false
DETECTED_DIR=""

if [ -f "$SERVICE_FILE" ]; then
    IS_INSTALLED=true
    # 尝试提取安装目录
    DETECTED_DIR=$(grep "WorkingDirectory" "$SERVICE_FILE" | cut -d= -f2 | xargs)
    
    if systemctl is-active --quiet xmp-monitor; then
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
    echo -e "2. ${RED}卸载 Monitor${NC} (删除程序和配置文件)"
    echo -e "3. ${YELLOW}完全重装${NC} (删除旧数据，重新安装)"
    echo -e "4. 退出"
    read -p "请输入选项 [1-4]: " ACTION
else
    echo -e "状态: ${YELLOW}未安装${NC}"
    echo ""
    echo -e "请选择操作："
    echo -e "1. ${GREEN}安装 Monitor${NC}"
    echo -e "2. ${RED}卸载 Monitor${NC} (清理残留)"
    echo -e "3. 退出"
    read -p "请输入选项 [1-3]: " ACTION
fi

# 规范化操作动作
MODE="EXIT"

if [ "$IS_INSTALLED" = true ]; then
    case "$ACTION" in
        1) MODE="UPDATE" ;;
        2) MODE="UNINSTALL" ;;
        3) MODE="INSTALL" ;;
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
    echo -e "${RED}警告：即将卸载 XMP Monitor。${NC}"
    echo -e "此操作将执行以下动作："
    echo -e "1. 停止并禁用 xmp-monitor 服务"
    echo -e "2. 删除系统服务文件"
    echo -e "3. 删除安装目录下的所有文件"
    
    read -p "确认卸载？(y/n) [n]: " confirm_uninstall
    if [[ "$confirm_uninstall" != "y" ]]; then
        echo "取消卸载。"
        exit 0
    fi

    echo -e "${BLUE}> 正在停止服务...${NC}"
    systemctl stop xmp-monitor 2>/dev/null
    systemctl disable xmp-monitor 2>/dev/null

    echo -e "${BLUE}> 清理系统服务...${NC}"
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload

    echo -e "${BLUE}> 终止残留进程...${NC}"
    pkill -f xmp-monitor 2>/dev/null

    echo -e "${BLUE}> 删除文件...${NC}"
    TARGET_DIR="${DETECTED_DIR:-/opt/xmp-monitor}"
    
    if [ -d "$TARGET_DIR" ]; then
        if [[ "$TARGET_DIR" == "/" || "$TARGET_DIR" == "/root" || "$TARGET_DIR" == "/home" ]]; then
             echo -e "${RED}错误：检测到的安装目录为敏感目录 ($TARGET_DIR)，跳过自动删除，请手动清理。${NC}"
        else
            rm -rf "$TARGET_DIR"
            echo -e "${GREEN}已删除安装目录: $TARGET_DIR${NC}"
        fi
    else
        echo "目录 $TARGET_DIR 不存在，跳过删除。"
    fi
    
    # 可选：提示是否删除用户
    # userdel xmpadmin 2>/dev/null
    
    echo -e "${GREEN}卸载完成。${NC}"
    exit 0
fi

# 4. 执行逻辑 - 安装/更新/重装
echo "准备开始..."
read -p "按回车键继续..."

# 4.1 环境检查
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

# 安装基础工具
echo -e "${BLUE}> 安装基础工具 (${PACKAGE_MANAGER})...${NC}"
DEPENDENCIES="curl wget unzip net-tools" 
if [ "$PACKAGE_MANAGER" == "apt" ]; then
    apt-get update -y >/dev/null 2>&1
    apt-get install -y $DEPENDENCIES >/dev/null 2>&1
elif [ "$PACKAGE_MANAGER" == "yum" ]; then
    yum install -y $DEPENDENCIES >/dev/null 2>&1
elif [ "$PACKAGE_MANAGER" == "dnf" ]; then
    dnf install -y $DEPENDENCIES >/dev/null 2>&1
fi

# 创建用户 xmpadmin (如果不存在)
if ! id "xmpadmin" &>/dev/null; then
    echo -e "${BLUE}> 创建运行用户 xmpadmin...${NC}"
    useradd -r -s /sbin/nologin xmpadmin
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
    systemctl stop xmp-monitor 2>/dev/null
    
    # 备份配置文件
    CONFIG_FILE="$INSTALL_DIR/conf.json"
    if [ -f "$CONFIG_FILE" ]; then
        cp "$CONFIG_FILE" /tmp/monitor_admin.json.bak
        echo -e "${GREEN}配置文件已备份。${NC}"
    else
        echo -e "${YELLOW}警告: 未找到配置文件，更新可能丢失配置。${NC}"
    fi

elif [ "$MODE" == "INSTALL" ]; then
    if [ "$IS_INSTALLED" = true ]; then
        echo -e "${BLUE}> 正在清理旧版本...${NC}"
        systemctl stop xmp-monitor 2>/dev/null
        systemctl disable xmp-monitor 2>/dev/null
        rm -f "$SERVICE_FILE"
        systemctl daemon-reload
    fi

    echo -e "${BLUE}> 配置 Monitor 信息${NC}"
    
    # 安装目录
    read -p "请输入安装目录（建议默认，支持卸载） [默认: /opt/xmp-monitor]: " INSTALL_DIR
    INSTALL_DIR=${INSTALL_DIR:-/opt/xmp-monitor}
    mkdir -p "$INSTALL_DIR"

    # 端口
    if [ -n "$PORT" ]; then
        PORT=$(echo "$PORT" | tr -d '[:space:]')
        if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
            echo -e "${RED}无效端口（环境变量 PORT）。${NC}"
            exit 1
        fi
        if netstat -tunlp 2>/dev/null | grep -q ":$PORT "; then
            echo -e "${RED}错误: 端口 $PORT 已被占用，请更换。${NC}"
            exit 1
        fi
    else
        while true; do
            read -p "请输入运行端口 (PORT) [默认: 8080]: " PORT
            PORT=$(echo "$PORT" | tr -d '[:space:]')
            PORT=${PORT:-8080}
            if [[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; then 
                if netstat -tunlp 2>/dev/null | grep -q ":$PORT "; then
                    echo -e "${RED}错误: 端口 $PORT 已被占用，请更换。${NC}"
                    continue
                fi
                break
            fi
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

    # Secret
    if [ -n "$NODE_SECRET" ]; then
        NODE_SECRET="$(echo "${NODE_SECRET}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        if [ -z "$NODE_SECRET" ]; then
            echo -e "${RED}密钥不能为空（环境变量 NODE_SECRET）。${NC}"
            exit 1
        fi
    else
        while true; do
            read -p "请输入节点密钥 (NODE_SECRET): " NODE_SECRET
            NODE_SECRET="$(echo "${NODE_SECRET}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
            if [ -n "$NODE_SECRET" ]; then break; fi
            echo -e "${RED}密钥不能为空。${NC}"
        done
    fi

    # 生成配置文件
    CONFIG_FILE="$INSTALL_DIR/conf.json"
    cat > "$CONFIG_FILE" <<EOF
{
  "port": $PORT,
  "node_id": $NODE_ID,
  "node_secret": "$NODE_SECRET"
}
EOF
    echo -e "${GREEN}配置文件已生成。${NC}"
fi


# 4.3 下载与部署
echo -e "${BLUE}> 下载程序...${NC}"
cd "$INSTALL_DIR" || exit 1
rm -f xmp-monitor.zip

read -p "当前服务器是否位于中国大陆? (y/n) [y]: " IS_CHINA
IS_CHINA=${IS_CHINA:-y}
DOWNLOAD_URLS_CN=(
    "https://node.xmpanel.cn/v1/monitor/xmp-monitor.zip"
    "https://hk.xmp.plus/v1/monitor/xmp-monitor.zip"
)
DOWNLOAD_URLS_GLOBAL=(
    "https://node.xmpanel.cn/v1/monitor/xmp-monitor.zip"
    "https://hk.xmp.plus/v1/monitor/xmp-monitor.zip"
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
MIN_SIZE=$((5 * 1024 * 1024))

for url in "${DOWNLOAD_URLS[@]}"; do
    for attempt in 1 2; do
        echo -e "${BLUE}> 尝试下载: $url (第${attempt}次)...${NC}"
        if wget -T 15 -t 2 -O xmp-monitor.zip "$url"; then
            FILE_SIZE=$(stat -c%s xmp-monitor.zip)
            if [ "$FILE_SIZE" -ge "$MIN_SIZE" ]; then
                if head -c 512 xmp-monitor.zip | grep -qi -e "<html" -e "<!doctype"; then
                    echo -e "${YELLOW}下载内容疑似为网页，准备重试...${NC}"
                    rm -f xmp-monitor.zip
                else
                    DOWNLOAD_SUCCESS=true
                    break
                fi
            else
                echo -e "${YELLOW}下载文件校验失败(过小)，准备重试...${NC}"
                rm -f xmp-monitor.zip
            fi
        fi
    done
    [ "$DOWNLOAD_SUCCESS" = true ] && break
done

if [ "$DOWNLOAD_SUCCESS" = false ]; then
    echo -e "${RED}错误: 下载失败，请检查网络。${NC}"
    exit 1
fi

echo "正在解压..."
unzip -o xmp-monitor.zip >/dev/null
rm -f xmp-monitor.zip

# 目录结构调整
if [ ! -f "xmp-monitor" ] && [ -d "xmp-monitor" ] && [ -f "xmp-monitor/xmp-monitor" ]; then
    mv xmp-monitor/* .
    rmdir xmp-monitor
fi

# 恢复配置文件 (更新模式)
if [ "$MODE" == "UPDATE" ] && [ -f "/tmp/monitor_admin.json.bak" ]; then
    mv /tmp/monitor_admin.json.bak "$INSTALL_DIR/conf.json"
    echo -e "${GREEN}配置文件已恢复。${NC}"
fi

# 设置权限 (递归归属 xmpadmin)
echo -e "${BLUE}> 设置文件权限 (用户: xmpadmin)...${NC}"
chmod +x xmp-monitor
chown -R xmpadmin:xmpadmin "$INSTALL_DIR"


# 4.4 试运行 (以 xmpadmin 身份)
echo -e "${BLUE}> 正在进行试运行检测 (约 10 秒)...${NC}"
# 确保 conf.json 存在
if [ ! -f "conf.json" ]; then
    echo -e "${RED}错误: 配置文件不存在，无法启动。${NC}"
    exit 1
fi

# 使用 su -s /bin/bash xmpadmin -c 运行
# 注意：需要把 PID 打印出来以便脚本捕捉
CMD="nohup $INSTALL_DIR/xmp-monitor >/dev/null 2>&1 & echo \$!"
PID=$(su -s /bin/bash xmpadmin -c "$CMD")

CHECK_DURATION=10
SUCCESS=false

for ((i=1; i<=CHECK_DURATION; i++)); do
    if ! kill -0 $PID 2>/dev/null; then
        echo -e "${RED}试运行失败: 进程意外退出。${NC}"
        break
    fi
    if [ $i -eq $CHECK_DURATION ]; then
        SUCCESS=true
    fi
    echo -n "."
    sleep 1
done
echo ""

kill $PID 2>/dev/null
wait $PID 2>/dev/null

if [ "$SUCCESS" = false ]; then
    echo -e "${RED}启动失败，请检查配置或端口占用情况。${NC}"
    echo -e "提示: 可能是端口被占用，或 xmpadmin 用户无权访问该目录。"
    exit 1
fi


# 4.5 配置服务
echo -e "${BLUE}> 配置系统服务...${NC}"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=XMP Monitor Service
After=network.target

[Service]
Type=simple
User=xmpadmin
Group=xmpadmin
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/xmp-monitor
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable xmp-monitor
systemctl start xmp-monitor

if ! systemctl is-active --quiet xmp-monitor; then
    echo -e "${RED}服务启动失败。${NC}"
    exit 1
fi
echo -e "${GREEN}服务已启动。${NC}"

# 5. 完成
echo ""
echo -e "${BLUE}==========================================================${NC}"
if [ "$MODE" == "UPDATE" ]; then
    echo -e "${GREEN} XMP Monitor 更新完成！${NC}"
else
    echo -e "${GREEN} XMP Monitor 安装完成！${NC}"
fi
echo -e "${BLUE}==========================================================${NC}"
echo -e "请前往主控页面: ${YELLOW}节点管理 -> 找到目标节点 -> 点击获取程序版本${NC}"
echo -e "获取成功则代表安装成功。"
echo ""
