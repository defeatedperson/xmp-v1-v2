#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}错误: 此脚本需要root权限运行${NC}"
        echo -e "${YELLOW}请使用: sudo $0${NC}"
        exit 1
    fi
}

detect_system() {
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        OS_NAME=$ID
        OS_VERSION=$VERSION_ID
        OS_PRETTY_NAME=$PRETTY_NAME
    else
        OS_NAME="unknown"
        OS_VERSION="unknown"
        OS_PRETTY_NAME="Unknown Linux"
    fi
}

detect_firewall() {
    hash -r

    FIREWALL_TOOL=""
    FIREWALL_STATUS="未安装"

    if systemctl is-active --quiet firewalld 2>/dev/null; then
        FIREWALL_TOOL="firewalld"
        FIREWALL_STATUS="运行中"
    elif command -v ufw &> /dev/null; then
        FIREWALL_TOOL="ufw"
        if ufw status | grep -q "active"; then
            FIREWALL_STATUS="运行中"
        else
            FIREWALL_STATUS="已安装"
        fi
    elif command -v firewall-cmd &> /dev/null; then
        FIREWALL_TOOL="firewalld"
        if systemctl is-active --quiet firewalld 2>/dev/null; then
            FIREWALL_STATUS="运行中"
        else
            FIREWALL_STATUS="已安装"
        fi
    fi
}

firewalld_list_ports() {
    echo -e "${CYAN}=== Firewalld 端口列表 ===${NC}\n"

    local temp_file=$(mktemp)

    firewall-cmd --list-all > "$temp_file" 2>&1

    if [[ ! -s "$temp_file" ]]; then
        echo -e "${YELLOW}无法获取端口列表${NC}"
        rm -f "$temp_file"
        return 1
    fi

    echo -e "${GREEN}开放的端口:${NC}"
    local ports=$(firewall-cmd --list-ports 2>/dev/null)
    if [[ -z "$ports" ]]; then
        echo -e "${YELLOW}无开放端口${NC}"
    else
        local counter=1
        for port in $ports; do
            echo -e "  [${GREEN}$counter${NC}]  $port (IPv4+IPv6)"
            ((counter++))
        done
    fi

    rm -f "$temp_file"
}

ufw_list_ports() {
    echo -e "${CYAN}=== UFW 端口列表 ===${NC}\n"

    local output=$(ufw status numbered 2>&1)
    echo "$output"
}

firewalld_add_port() {
    local port=$1
    local protocol=$2
    local ip_scope=$3

    local port_protocol="${port}/${protocol}"

    if [[ "$ip_scope" == "1" ]]; then
        firewall-cmd --permanent --add-port="$port_protocol"
        firewall-cmd --reload
    elif [[ "$ip_scope" == "2" ]]; then
        firewall-cmd --permanent --add-port="$port_protocol"
        firewall-cmd --reload
    else
        firewall-cmd --permanent --add-port="$port_protocol"
        firewall-cmd --reload
    fi

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ 规则添加成功: $port_protocol${NC}"
        return 0
    else
        echo -e "${RED}✗ 规则添加失败${NC}"
        return 1
    fi
}

ufw_add_port() {
    local port=$1
    local protocol=$2
    local ip_scope=$3

    local cmd="ufw allow"

    if [[ "$ip_scope" == "1" ]]; then
        cmd="$cmd $port/$protocol"
    elif [[ "$ip_scope" == "2" ]]; then
        cmd="$cmd $port/$protocol"
    else
        cmd="$cmd $port/$protocol"
    fi

    $cmd &>/dev/null

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ 规则添加成功: $port/$protocol${NC}"
        return 0
    else
        echo -e "${RED}✗ 规则添加失败${NC}"
        return 1
    fi
}

firewalld_remove_port() {
    local index=$1
    local ports=$(firewall-cmd --list-ports 2>/dev/null)

    if [[ -z "$ports" ]]; then
        echo -e "${YELLOW}没有可删除的端口${NC}"
        return 1
    fi

    local counter=1
    local target_port=""

    for port in $ports; do
        if [[ $counter -eq $index ]]; then
            target_port=$port
            break
        fi
        ((counter++))
    done

    if [[ -z "$target_port" ]]; then
        echo -e "${RED}无效的规则编号${NC}"
        return 1
    fi

    firewall-cmd --permanent --remove-port="$target_port"
    firewall-cmd --reload

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ 规则删除成功: $target_port${NC}"
        return 0
    else
        echo -e "${RED}✗ 规则删除失败${NC}"
        return 1
    fi
}

ufw_remove_port() {
    local index=$1
    local output=$(ufw status numbered 2>&1)
    local line_num=$(echo "$output" | grep -E "^\s*\[\s*${index}\]" | head -1)

    if [[ -z "$line_num" ]]; then
        echo -e "${RED}无效的规则编号${NC}"
        return 1
    fi

    echo -e "${YELLOW}将删除规则:${NC}"
    echo "$line_num"
    read -p "确认删除? (y/N): " confirm

    if [[ "$confirm" != "y" ]] && [[ "$confirm" != "Y" ]]; then
        echo -e "${YELLOW}已取消删除${NC}"
        return 0
    fi

    local delete_output
    delete_output=$(printf "y\n" | ufw delete "$index" 2>&1)
    local exit_code=$?

    echo "$delete_output"

    if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}✓ 规则删除成功: 编号 $index${NC}"
        return 0
    else
        echo -e "${RED}✗ 规则删除失败${NC}"
        return 1
    fi
}

install_firewalld() {
    echo -e "${CYAN}正在安装 Firewalld...${NC}"

    if [[ "$OS_NAME" == "centos" ]] || [[ "$OS_NAME" == "rhel" ]] || [[ "$OS_NAME" == "rocky" ]] || [[ "$OS_NAME" == "almalinux" ]]; then
        yum install -y firewalld
    elif [[ "$OS_NAME" == "debian" ]] || [[ "$OS_NAME" == "ubuntu" ]]; then
        apt-get update && apt-get install -y firewalld
    else
        echo -e "${RED}不支持的系统${NC}"
        return 1
    fi

    systemctl enable firewalld
    systemctl start firewalld

    if [[ $? -ne 0 ]]; then
        echo -e "${RED}✗ Firewalld 安装失败${NC}"
        return 1
    fi

    echo ""
    echo -e "${YELLOW}请输入需要保留的端口（防止被锁在外面）:${NC}"
    read -p "SSH端口 (默认22): " ssh_port
    ssh_port=${ssh_port:-22}

    read -p "管理端口 (可选，推荐填写): " mgmt_port

    if ! validate_port "$ssh_port"; then
        echo -e "${RED}SSH端口验证失败，使用默认端口22${NC}"
        ssh_port=22
    fi

    if [[ -n "$mgmt_port" ]]; then
        if ! validate_port "$mgmt_port"; then
            echo -e "${RED}管理端口验证失败，跳过${NC}"
            mgmt_port=""
        fi
    fi

    firewall-cmd --permanent --add-port="${ssh_port}/tcp"
    echo -e "${GREEN}✓ 已开放SSH端口 ${ssh_port}/tcp${NC}"

    if [[ -n "$mgmt_port" ]]; then
        firewall-cmd --permanent --add-port="${mgmt_port}/tcp"
        echo -e "${GREEN}✓ 已开放管理端口 ${mgmt_port}/tcp${NC}"
    fi

    firewall-cmd --reload

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ Firewalld 安装成功${NC}"
        detect_firewall
        return 0
    else
        echo -e "${RED}✗ Firewalld 安装失败${NC}"
        return 1
    fi
}

install_ufw() {
    echo -e "${CYAN}正在安装 UFW...${NC}"

    if [[ "$OS_NAME" == "centos" ]] || [[ "$OS_NAME" == "rhel" ]] || [[ "$OS_NAME" == "rocky" ]] || [[ "$OS_NAME" == "almalinux" ]]; then
        if [[ -f /etc/redhat-release ]]; then
            local release=$(cat /etc/redhat-release | grep -oE '[0-9]+' | head -1)
            if [[ $release -ge 8 ]]; then
                dnf install -y ufw
            else
                yum install -y ufw
            fi
        fi
    elif [[ "$OS_NAME" == "debian" ]] || [[ "$OS_NAME" == "ubuntu" ]]; then
        apt-get update && apt-get install -y ufw
    elif [[ "$OS_NAME" == "arch" ]]; then
        pacman -S --noconfirm ufw
    else
        echo -e "${RED}不支持的系统${NC}"
        return 1
    fi

    echo ""
    echo -e "${YELLOW}请输入需要保留的端口（防止被锁在外面）:${NC}"
    read -p "SSH端口 (默认22): " ssh_port
    ssh_port=${ssh_port:-22}

    read -p "管理端口 (可选，推荐填写): " mgmt_port

    if ! validate_port "$ssh_port"; then
        echo -e "${RED}SSH端口验证失败，使用默认端口22${NC}"
        ssh_port=22
    fi

    if [[ -n "$mgmt_port" ]]; then
        if ! validate_port "$mgmt_port"; then
            echo -e "${RED}管理端口验证失败，跳过${NC}"
            mgmt_port=""
        fi
    fi

    ufw allow ${ssh_port}/tcp
    echo -e "${GREEN}✓ 已开放SSH端口 ${ssh_port}/tcp${NC}"

    if [[ -n "$mgmt_port" ]]; then
        ufw allow ${mgmt_port}/tcp
        echo -e "${GREEN}✓ 已开放管理端口 ${mgmt_port}/tcp${NC}"
    fi

    ufw --force enable

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ UFW 安装成功${NC}"
        detect_firewall
        return 0
    else
        echo -e "${RED}✗ UFW 安装失败${NC}"
        return 1
    fi
}

uninstall_firewalld() {
    echo -e "${YELLOW}警告: 即将卸载 Firewalld${NC}"
    read -p "确认卸载? (y/N): " confirm

    if [[ "$confirm" != "y" ]] && [[ "$confirm" != "Y" ]]; then
        echo -e "${YELLOW}已取消卸载${NC}"
        return 0
    fi

    systemctl stop firewalld
    systemctl disable firewalld

    if [[ "$OS_NAME" == "centos" ]] || [[ "$OS_NAME" == "rhel" ]] || [[ "$OS_NAME" == "rocky" ]] || [[ "$OS_NAME" == "almalinux" ]]; then
        yum remove -y firewalld
    elif [[ "$OS_NAME" == "debian" ]] || [[ "$OS_NAME" == "ubuntu" ]]; then
        apt-get remove -y firewalld
    fi

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ Firewalld 卸载成功${NC}"
        detect_firewall
        return 0
    else
        echo -e "${RED}✗ Firewalld 卸载失败${NC}"
        return 1
    fi
}

uninstall_ufw() {
    echo -e "${YELLOW}警告: 即将卸载 UFW${NC}"
    read -p "确认卸载? (y/N): " confirm

    if [[ "$confirm" != "y" ]] && [[ "$confirm" != "Y" ]]; then
        echo -e "${YELLOW}已取消卸载${NC}"
        return 0
    fi

    ufw --force disable

    if [[ "$OS_NAME" == "centos" ]] || [[ "$OS_NAME" == "rhel" ]] || [[ "$OS_NAME" == "rocky" ]] || [[ "$OS_NAME" == "almalinux" ]]; then
        if [[ -f /etc/redhat-release ]]; then
            local release=$(cat /etc/redhat-release | grep -oE '[0-9]+' | head -1)
            if [[ $release -ge 8 ]]; then
                dnf remove -y ufw
            else
                yum remove -y ufw
            fi
        fi
    elif [[ "$OS_NAME" == "debian" ]] || [[ "$OS_NAME" == "ubuntu" ]]; then
        apt-get remove -y ufw
    elif [[ "$OS_NAME" == "arch" ]]; then
        pacman -R --noconfirm ufw
    fi

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ UFW 卸载成功${NC}"
        detect_firewall
        return 0
    else
        echo -e "${RED}✗ UFW 卸载失败${NC}"
        return 1
    fi
}

validate_port() {
    local port=$1

    if [[ ! "$port" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}错误: 端口号必须是数字${NC}"
        return 1
    fi

    if [[ $port -lt 1 ]] || [[ $port -gt 65535 ]]; then
        echo -e "${RED}错误: 端口号必须在 1-65535 之间${NC}"
        return 1
    fi

    return 0
}

validate_protocol() {
    local protocol=$1

    if [[ "$protocol" != "1" ]] && [[ "$protocol" != "2" ]] && [[ "$protocol" != "3" ]]; then
        echo -e "${RED}错误: 无效的选择${NC}"
        return 1
    fi

    return 0
}

validate_ip_scope() {
    local scope=$1

    if [[ "$scope" != "1" ]] && [[ "$scope" != "2" ]] && [[ "$scope" != "3" ]]; then
        echo -e "${RED}错误: 无效的选择${NC}"
        return 1
    fi

    return 0
}

check_firewall_conflict() {
    local has_firewalld=0
    local has_ufw=0

    if systemctl is-active --quiet firewalld 2>/dev/null; then
        has_firewalld=1
    fi

    if command -v ufw &> /dev/null; then
        if ufw status | grep -q "active"; then
            has_ufw=1
        fi
    fi

    if [[ $has_firewalld -eq 1 ]] && [[ $has_ufw -eq 1 ]]; then
        return 1
    fi

    return 0
}

show_header() {
    clear
    echo -e                              XMP防火墙管理${NC}                            
    echo -e                             官网: xmpanel.cn${NC}                           
    echo ""
}

show_port_list_simple() {
    if [[ -z "$FIREWALL_TOOL" ]]; then
        return
    fi

    echo -e "${BLUE}当前开放的端口:${NC}"

    if [[ "$FIREWALL_TOOL" == "firewalld" ]]; then
        local ports=$(firewall-cmd --list-ports 2>/dev/null)
        if [[ -z "$ports" ]]; then
            echo -e "  ${YELLOW}无开放端口${NC}"
        else
            local counter=1
            for port in $ports; do
                echo -e "  [${GREEN}$counter${NC}]  $port"
                ((counter++))
            done
        fi
    elif [[ "$FIREWALL_TOOL" == "ufw" ]]; then
        local output=$(ufw status numbered 2>/dev/null | grep -E "^\s*\[")
        if [[ -z "$output" ]]; then
            echo -e "  ${YELLOW}无开放端口${NC}"
        else
            echo "$output" | while IFS= read -r line; do
                if [[ -n "$line" ]]; then
                    echo "  $line"
                fi
            done
        fi
    fi

    echo ""
}

show_system_info() {
    echo -e "${BLUE}系统信息:${NC}"
    echo -e "  发行版: ${CYAN}$OS_PRETTY_NAME${NC}"
    echo -e "  防火墙: ${CYAN}${FIREWALL_TOOL^^}${NC} (${FIREWALL_STATUS})"

    if ! check_firewall_conflict; then
        echo -e "  ${RED}警告: 检测到两个防火墙同时运行！${NC}"
    fi

    echo ""
    show_port_list_simple
}

show_menu() {
    echo -e "${GREEN}菜单:${NC}"
    echo -e "  ${CYAN}1${NC}. 开启端口"
    echo -e "  ${CYAN}2${NC}. 关闭端口"
    echo -e "  ${CYAN}3${NC}. 刷新状态（刷新端口列表）"
    echo -e "  ${CYAN}4${NC}. 安装防火墙工具"
    echo -e "  ${CYAN}5${NC}. 卸载防火墙工具"
    echo -e "  ${CYAN}6${NC}. 启动防火墙（如果未启动）"
    echo -e "  ${RED}Q${NC}. 退出"
    echo ""
    read -p "请选择操作: " choice
}

add_port() {
    echo -e "${CYAN}=== 开启端口 ===${NC}\n"

    if ! check_firewall_conflict; then
        echo -e "${RED}错误: 检测到两个防火墙同时运行，请先卸载其中一个${NC}"
        read -p "按Enter键继续..."
        return 1
    fi

    if [[ -z "$FIREWALL_TOOL" ]]; then
        echo -e "${RED}错误: 未检测到防火墙工具${NC}"
        read -p "按Enter键继续..."
        return 1
    fi

    read -p "请输入端口号 (1-65535): " port

    if ! validate_port "$port"; then
        read -p "按Enter键继续..."
        return 1
    fi

    echo ""
    echo -e "请选择协议:"
    echo -e "  ${CYAN}1${NC}) tcp"
    echo -e "  ${CYAN}2${NC}) udp"
    echo -e "  ${CYAN}3${NC}) both"
    read -p "请选择: " protocol_choice

    if ! validate_protocol "$protocol_choice"; then
        read -p "按Enter键继续..."
        return 1
    fi

    local protocol=""
    case $protocol_choice in
        1) protocol="tcp" ;;
        2) protocol="udp" ;;
        3) protocol="both" ;;
    esac

    echo ""
    echo -e "请选择IP范围:"
    echo -e "  ${CYAN}1${NC}) 仅 IPv4"
    echo -e "  ${CYAN}2${NC}) 仅 IPv6"
    echo -e "  ${CYAN}3${NC}) IPv4 + IPv6"
    read -p "请选择: " ip_scope_choice

    if ! validate_ip_scope "$ip_scope_choice"; then
        read -p "按Enter键继续..."
        return 1
    fi

    echo ""
    if [[ "$FIREWALL_TOOL" == "firewalld" ]]; then
        if [[ "$protocol" == "both" ]]; then
            firewalld_add_port "$port" "tcp" "$ip_scope_choice"
            firewalld_add_port "$port" "udp" "$ip_scope_choice"
        else
            firewalld_add_port "$port" "$protocol" "$ip_scope_choice"
        fi
    elif [[ "$FIREWALL_TOOL" == "ufw" ]]; then
        if [[ "$protocol" == "both" ]]; then
            ufw_add_port "$port" "tcp" "$ip_scope_choice"
            ufw_add_port "$port" "udp" "$ip_scope_choice"
        else
            ufw_add_port "$port" "$protocol" "$ip_scope_choice"
        fi
    fi

    detect_firewall

    read -p "按Enter键继续..."
}

remove_port() {
    echo -e "${CYAN}=== 关闭端口 ===${NC}\n"

    if ! check_firewall_conflict; then
        echo -e "${RED}错误: 检测到两个防火墙同时运行，请先卸载其中一个${NC}"
        read -p "按Enter键继续..."
        return 1
    fi

    if [[ -z "$FIREWALL_TOOL" ]]; then
        echo -e "${RED}错误: 未检测到防火墙工具${NC}"
        read -p "按Enter键继续..."
        return 1
    fi

    if [[ "$FIREWALL_TOOL" == "firewalld" ]]; then
        firewalld_list_ports
    elif [[ "$FIREWALL_TOOL" == "ufw" ]]; then
        ufw_list_ports
    fi

    echo ""
    read -p "请输入要删除的规则编号: " index

    if [[ ! "$index" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}错误: 请输入有效的数字${NC}"
        read -p "按Enter键继续..."
        return 1
    fi

    echo ""

    if [[ "$FIREWALL_TOOL" == "firewalld" ]]; then
        firewalld_remove_port "$index"
    elif [[ "$FIREWALL_TOOL" == "ufw" ]]; then
        ufw_remove_port "$index"
    fi

    detect_firewall

    read -p "按Enter键继续..."
}

refresh_status() {
    detect_firewall

    if [[ "$FIREWALL_TOOL" == "firewalld" ]]; then
        firewalld_list_ports
    elif [[ "$FIREWALL_TOOL" == "ufw" ]]; then
        ufw_list_ports
    else
        echo -e "${YELLOW}未检测到防火墙工具${NC}"
    fi

    echo ""
    read -p "按Enter键继续..."
}

start_firewall() {
    echo -e "${CYAN}=== 启动防火墙 ===${NC}\n"

    if [[ -z "$FIREWALL_TOOL" ]]; then
        echo -e "${RED}错误: 未检测到防火墙工具${NC}"
        read -p "按Enter键继续..."
        return 1
    fi

    if [[ "$FIREWALL_STATUS" == "运行中" ]]; then
        echo -e "${YELLOW}防火墙已经在运行中${NC}"
        read -p "按Enter键继续..."
        return 0
    fi

    if [[ "$FIREWALL_TOOL" == "firewalld" ]]; then
        systemctl start firewalld
        if [[ $? -eq 0 ]]; then
            echo -e "${GREEN}✓ Firewalld 启动成功${NC}"
            detect_firewall
        else
            echo -e "${RED}✗ Firewalld 启动失败${NC}"
        fi
    elif [[ "$FIREWALL_TOOL" == "ufw" ]]; then
        ufw --force enable
        if [[ $? -eq 0 ]]; then
            echo -e "${GREEN}✓ UFW 启动成功${NC}"
            detect_firewall
        else
            echo -e "${RED}✗ UFW 启动失败${NC}"
        fi
    fi

    read -p "按Enter键继续..."
}

install_firewall() {
    echo -e "${CYAN}=== 安装防火墙工具 ===${NC}\n"

    if command -v firewall-cmd &> /dev/null; then
        echo -e "${YELLOW}Firewalld 已安装${NC}"
    fi

    if command -v ufw &> /dev/null; then
        echo -e "${YELLOW}UFW 已安装${NC}"
    fi

    echo ""
    echo -e "请选择要安装的防火墙工具:"
    echo -e "  ${CYAN}1${NC}) Firewalld (推荐用于 CentOS/RHEL)"
    echo -e "  ${CYAN}2${NC}) UFW (推荐用于 Debian/Ubuntu)"
    echo -e "  ${CYAN}0${NC}) 返回"
    read -p "请选择: " choice

    case $choice in
        1)
            install_firewalld
            ;;
        2)
            install_ufw
            ;;
        0)
            return 0
            ;;
        *)
            echo -e "${RED}无效的选择${NC}"
            ;;
    esac

    read -p "按Enter键继续..."
}

uninstall_firewall() {
    echo -e "${CYAN}=== 卸载防火墙工具 ===${NC}\n"

    local has_firewalld=0
    local has_ufw=0

    if command -v firewall-cmd &> /dev/null; then
        has_firewalld=1
        echo -e "  ${CYAN}1${NC}) Firewalld"
    fi

    if command -v ufw &> /dev/null; then
        has_ufw=1
        echo -e "  ${CYAN}2${NC}) UFW"
    fi

    if [[ $has_firewalld -eq 0 ]] && [[ $has_ufw -eq 0 ]]; then
        echo -e "${YELLOW}没有可卸载的防火墙工具${NC}"
        read -p "按Enter键继续..."
        return 0
    fi

    echo ""
    echo -e "  ${CYAN}0${NC}) 返回"
    read -p "请选择要卸载的防火墙工具: " choice

    case $choice in
        1)
            if [[ $has_firewalld -eq 1 ]]; then
                uninstall_firewalld
            else
                echo -e "${RED}Firewalld 未安装${NC}"
            fi
            ;;
        2)
            if [[ $has_ufw -eq 1 ]]; then
                uninstall_ufw
            else
                echo -e "${RED}UFW 未安装${NC}"
            fi
            ;;
        0)
            return 0
            ;;
        *)
            echo -e "${RED}无效的选择${NC}"
            ;;
    esac

    read -p "按Enter键继续..."
}

main() {
    check_root
    detect_system
    detect_firewall

    while true; do
        show_header
        show_system_info

        show_menu

        case $choice in
            1)
                add_port
                ;;
            2)
                remove_port
                ;;
            3)
                refresh_status
                ;;
            4)
                install_firewall
                ;;
            5)
                uninstall_firewall
                ;;
            6)
                start_firewall
                ;;
            q|Q)
                echo -e "${GREEN}感谢使用 XMP防火墙管理工具！${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}无效的选择，请重新输入${NC}"
                sleep 1
                ;;
        esac
    done
}

main
