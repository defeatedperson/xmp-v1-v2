# XMP 独立监控程序 API 文档

## 概述

XMP独立监控程序是一个基于Go语言开发的系统监控服务，用于收集和提供系统资源使用情况数据。通过HTTPS (mTLS) 对外提供服务。

## 功能特点

- 实时监控系统资源使用情况（CPU、内存、磁盘、网络）
- mTLS双向认证
- SQLite数据库存储历史数据
- RESTful API接口
- 自动清理7天前的历史数据

## 启动要求

### 1. 配置文件

在程序目录下创建 `.env` 文件，必须包含 `PORT` 字段：

```
PORT=8333
```

### 2. 证书目录

在程序目录下创建 `cert` 目录，必须包含以下文件：

| 文件名 | 说明 |
|--------|------|
| cert.pem | 服务器证书 |
| cert.key | 服务器私钥 |
| ca.pem | CA证书（用于验证客户端） |

## API 接口

### 请求地址

`https://<ip>:<port>/`

### 请求方法

只接受GET请求

### 认证

mTLS双向认证，客户端必须使用CA签发的证书。

---

### 接口1: 获取监控数据

**路径**: `/monitor`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| day_offset | int | 否 | 天数偏移，0表示今天，1表示昨天，默认0，最大30 |

**示例**:
```
GET /monitor?day_offset=0
```

**响应格式**:

成功响应：
```json
{
  "success": true,
  "monitor_data": [
    {
      "id": 1,
      "timestamp": "2025-11-17T19:15:00+08:00",
      "cpu_usage": 7.8,
      "memory_usage": 44,
      "disk_usage": 42.16,
      "upload_mbps": 0.10,
      "download_mbps": 0.005
    }
  ],
  "device_info": {
    "cpu_model": "12th Gen Intel(R) Core(TM) i7-12700H",
    "cores": 20,
    "memory_size_mb": 32534.05,
    "disk_size_mb": 283465.99
  },
  "monthly_traffic": {
    "month": "2025-11",
    "upload": 0,
    "download": 0
  }
}
```

失败响应：
```json
{
  "success": false,
  "message": "错误信息"
}
```

**monitor_data 字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int64 | 数据记录ID |
| timestamp | string | 时间戳（ISO 8601格式） |
| cpu_usage | float64 | CPU使用率（百分比） |
| memory_usage | float64 | 内存使用率（百分比） |
| disk_usage | float64 | 磁盘使用率（百分比） |
| upload_mbps | float64 | 上传速度（MB/s） |
| download_mbps | float64 | 下载速度（MB/s） |

**device_info 字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| cpu_model | string | CPU型号 |
| cores | int | CPU核心数 |
| memory_size_mb | float64 | 内存总量（MB） |
| disk_size_mb | float64 | 磁盘总量（MB） |

**monthly_traffic 字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| month | string | 月份（YYYY-MM格式） |
| upload | float64 | 本月上传流量（MB） |
| download | float64 | 本月下载流量（MB） |

---

### 接口2: 获取实时系统资源

**路径**: `/system`

**参数**: 无

**示例**:
```
GET /system
```

**响应格式**:

成功响应：
```json
{
  "success": true,
  "data": {
    "cpu": 10,
    "memory": 45
  }
}
```

失败响应：
```json
{
  "success": false,
  "message": "错误信息"
}
```

---

### 接口3: 获取版本信息

**路径**: `/version`

**参数**: 无

**示例**:
```
GET /version
```

**响应**:
```json
{
  "version": "xmp-monitor v2.0.0"
}
```

## 数据收集机制

程序每30秒自动收集一次系统监控数据，包括：

1. CPU使用率
2. 内存使用率
3. 磁盘使用率
4. 网络上传/下载速度

数据会被截断到5分钟间隔，并存储在SQLite数据库中。如果同一时间点已存在数据，会比较并更新为较大值。

## 数据库

程序使用SQLite数据库存储监控数据，数据库文件名为 `monitor.db`，位于程序目录下的 `monitor` 文件夹中。数据库会自动清理7天前的旧数据。

## 错误处理

程序在以下情况下会返回错误响应：

1. 配置文件 `.env` 不存在或缺少 PORT
2. 证书目录或证书文件缺失
3. 请求方法不是GET
4. day_offset参数无效
5. 服务器内部错误

## 使用示例

### curl示例

```bash
curl -k --cert ./client.crt --key ./client.key --cacert ./ca.pem \
  https://localhost:8333/monitor?day_offset=0
```

```bash
curl -k --cert ./client.crt --key ./client.key --cacert ./ca.pem \
  https://localhost:8333/system
```

## 注意事项

1. 程序需要管理员权限才能获取某些系统信息
2. 首次运行时可能会被防火墙阻止，需要添加例外
3. mTLS认证需要客户端提供有效的证书
