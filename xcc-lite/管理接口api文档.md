# XCC-Lite 管理接口 API 文档

## 概述

XCC-Lite 管理接口提供配置热加载、缓存清理、统计数据查询等功能。所有接口均通过 HTTPS 访问，使用 mTLS 双向认证保护。

- **默认端口**: 8443（可通过环境变量配置）
- **认证方式**: mTLS 双向证书认证
- **内容类型**: `application/json`

---

## 接口列表

| 接口路径 | HTTP 方法 | 说明 |
|---------|-----------|------|
| `/version` | GET | 获取服务版本信息 |
| `/admin/events/recent` | GET | 查询最近事件日志 |
| `/admin/stats/day` | GET | 查询指定域名的日统计数据 |
| `/admin/reload` | POST | 重载域名配置 |
| `/admin/config/apply` | POST | 应用新配置 |
| `/admin/acl/remove` | POST | 从 ACL 列表移除 IP |
| `/admin/cache/clear` | POST | 清理指定域名的缓存 |
| `/admin/certs/upload` | POST | 上传 SSL 证书 |
| `/admin/certs/cleanup` | POST | 清理无用证书 |

---

## 接口详情

### 1. 获取版本信息

**路径**: `/version`  
**方法**: `GET`

查询服务版本信息。

**请求示例**:

```bash
curl -k https://localhost:8443/version
```

**响应示例**:

```json
{
  "version": "xcc-lite v1.0.1"
}
```

---

### 2. 查询最近事件

**路径**: `/admin/events/recent`  
**方法**: `GET`

查询最近的事件日志记录，最多返回 300 条。

**请求示例**:

```bash
curl -k https://localhost:8443/admin/events/recent
```

**响应示例**:

```json
[
  {
    "id": 300,
    "type": "信息",
    "details": "{\"event\": \"config_reload\", \"domains\": [\"example.com\"]}",
    "ts": 1710739200
  },
  {
    "id": 299,
    "type": "警告",
    "details": "{\"event\": \"cc_attack\", \"ip\": \"192.168.1.100\", \"domain\": \"example.com\"}",
    "ts": 1710739100
  }
]
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 事件 ID |
| type | string | 事件类型（信息、警告、错误等） |
| details | string | 事件详情（JSON 字符串，需解析） |
| ts | int64 | Unix 时间戳（秒） |

---

### 3. 查询日统计数据

**路径**: `/admin/stats/day`  
**方法**: `GET`

查询指定域名在某一天的 5 分钟粒度统计数据。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| domain | string | 是 | 域名名称 |
| day | int | 是 | 天数偏移，0=今天，1=昨天，最大6 |

**请求示例**:

```bash
# 查询 example.com 今天的统计
curl -k "https://localhost:8443/admin/stats/day?domain=example.com&day=0"

# 查询 example.com 昨天的统计
curl -k "https://localhost:8443/admin/stats/day?domain=example.com&day=1"
```

**响应示例**:

```json
{
  "domain": "example.com",
  "day": 0,
  "start": 1710739200,
  "end": 1710825600,
  "rows": [
    {
      "ts": 1710739200,
      "fmt_time": "2024-03-18 00:00",
      "req_count": 1250,
      "bytes_in": 5242880,
      "bytes_out": 104857600,
      "cache_hit_count": 800,
      "status_2xx": 1100,
      "status_3xx": 50,
      "status_4xx": 80,
      "status_5xx": 20
    },
    {
      "ts": 1710739500,
      "fmt_time": "2024-03-18 00:05",
      "req_count": 1320,
      "bytes_in": 5505024,
      "bytes_out": 115343360,
      "cache_hit_count": 850,
      "status_2xx": 1200,
      "status_3xx": 60,
      "status_4xx": 45,
      "status_5xx": 15
    }
  ]
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| domain | string | 查询的域名 |
| day | int | 查询的天数偏移 |
| start | int64 | 查询开始时间戳（Unix） |
| end | int64 | 查询结束时间戳（Unix） |
| rows | array | 5 分钟统计数据数组 |

**rows 数组元素**:

| 字段 | 类型 | 说明 |
|------|------|------|
| ts | int64 | 时间戳（5 分钟区间起点，Unix 秒） |
| fmt_time | string | 格式化时间（YYYY-MM-DD HH:MM） |
| req_count | int | 请求总数 |
| bytes_in | int64 | 入站流量（字节） |
| bytes_out | int64 | 出站流量（字节） |
| cache_hit_count | int | 缓存命中数 |
| status_2xx | int | 2xx 状态码数量 |
| status_3xx | int | 3xx 状态码数量 |
| status_4xx | int | 4xx 状态码数量 |
| status_5xx | int | 5xx 状态码数量 |

---

### 4. 重载配置

**路径**: `/admin/reload`  
**方法**: `POST`

重新加载域名配置文件，重新构建路由规则。

**请求示例**:

```bash
curl -k -X POST https://localhost:8443/admin/reload
```

**响应示例**:

```json
{
  "status": "ok"
}
```

**错误响应** (500 Internal Server Error):

```json
{
  "error": "配置加载失败: xxx"
}
```

---

### 5. 应用新配置

**路径**: `/admin/config/apply`  
**方法**: `POST`

批量应用新的域名配置和 ACL 规则。

**请求体**:

```json
{
  "acl": {
    "whitelist": ["192.168.1.0/24"],
    "blacklist": ["10.0.0.0/8"]
  },
  "domains": [
    {
      "domain": "example.com",
      "origin": "http://192.168.1.10:8080",
      "path": "/",
      "https_enabled": true,
      "cache_enabled": true,
      "cache_ttl": 3600
    }
  ],
  "acme_upstream": "http://127.0.0.1:8080"
}
```

**请求字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| acl | object | 否 | ACL 配置对象 |
| acl.whitelist | array | 否 | IP 白名单（CIDR 格式） |
| acl.blacklist | array | 否 | IP 黑名单（CIDR 格式） |
| domains | array | 是 | 域名配置数组，最多 10 个 |
| domains[].domain | string | 是 | 域名 |
| domains[].origin | string | 是 | 源站地址 |
| domains[].path | string | 否 | 路径前缀，默认为 "/" |
| domains[].https_enabled | bool | 否 | 是否启用 HTTPS |
| domains[].cache_enabled | bool | 否 | 是否启用缓存 |
| domains[].cache_ttl | int | 否 | 缓存 TTL（秒） |
| acme_upstream | string | 否 | ACME 验证上游地址 |

**请求示例**:

```bash
curl -k -X POST https://localhost:8443/admin/config/apply \
  -H "Content-Type: application/json" \
  -d '{
    "acl": {
      "whitelist": ["192.168.1.0/24"]
    },
    "domains": [
      {
        "domain": "example.com",
        "origin": "http://192.168.1.10:8080",
        "https_enabled": true,
        "cache_enabled": true
      }
    ]
  }'
```

**响应示例**:

```json
{
  "status": "ok"
}
```

---

### 6. 从 ACL 移除 IP

**路径**: `/admin/acl/remove`  
**方法**: `POST`

从白名单或黑名单中移除指定的 IP 地址。

**请求体**:

```json
{
  "list": "white",
  "ip": "192.168.1.100"
}
```

**请求字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| list | string | 是 | 列表类型：`white`（白名单）或 `black`（黑名单） |
| ip | string | 是 | 要移除的 IP 地址 |

**请求示例**:

```bash
curl -k -X POST https://localhost:8443/admin/acl/remove \
  -H "Content-Type: application/json" \
  -d '{"list": "white", "ip": "192.168.1.100"}'
```

**响应示例**:

```json
{
  "status": "ok"
}
```

---

### 7. 清理缓存

**路径**: `/admin/cache/clear`  
**方法**: `POST`

清理指定域名的本地磁盘缓存。

**请求体**:

```json
{
  "domain": "example.com"
}
```

**请求字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| domain | string | 是 | 要清理缓存的域名（不支持 "all"） |

**请求示例**:

```bash
curl -k -X POST https://localhost:8443/admin/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
```

**响应示例**:

```json
{
  "status": "ok"
}
```

---

### 8. 上传证书

**路径**: `/admin/certs/upload`  
**方法**: `POST`

上传 SSL 证书到指定域名的证书目录。

**请求体**:

```json
{
  "domain": "example.com",
  "public_pem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "private_pem": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
}
```

**请求字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| domain | string | 是 | 域名（用于存储目录） |
| public_pem | string | 是 | 公钥证书（PEM 格式） |
| private_pem | string | 是 | 私钥（PEM 格式） |

**请求示例**:

```bash
curl -k -X POST https://localhost:8443/admin/certs/upload \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "public_pem": "-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----",
    "private_pem": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----"
  }'
```

**响应示例**:

```json
{
  "status": "ok"
}
```

---

### 9. 清理无用证书

**路径**: `/admin/certs/cleanup`  
**方法**: `POST`

清理不在当前配置中的域名证书目录。

**请求示例**:

```bash
curl -k -X POST https://localhost:8443/admin/certs/cleanup
```

**响应示例**:

```json
{
  "status": "ok"
}
```

---

## 错误码说明

| HTTP 状态码 | 说明 |
|-------------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误（缺少必填字段、参数格式错误等） |
| 405 | 请求方法不允许（部分接口仅支持 POST） |
| 500 | 服务器内部错误（配置加载失败、数据库错误等） |

---

## mTLS 客户端证书

管理接口使用 mTLS 双向认证，需要准备以下证书文件：

- `cert.pem` - 服务器证书
- `cert.key` - 服务器私钥
- `ca.pem` - CA 根证书（用于验证客户端证书）

确保客户端使用由 CA 签发的有效证书进行访问。

---

## curl 使用示例

```bash
# 获取版本信息（GET）
curl -k https://localhost:8443/version

# 查询最近事件（GET）
curl -k https://localhost:8443/admin/events/recent

# 查询日统计（GET）
curl -k "https://localhost:8443/admin/stats/day?domain=example.com&day=0"

# 重载配置（POST）
curl -k -X POST https://localhost:8443/admin/reload

# 应用新配置（POST）
curl -k -X POST https://localhost:8443/admin/config/apply \
  -H "Content-Type: application/json" \
  -d '{"domains":[{"domain":"example.com","origin":"http://192.168.1.10:8080"}]}'

# 清理缓存（POST）
curl -k -X POST https://localhost:8443/admin/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com"}'
```

> 注意：`-k` 参数用于跳过 SSL 证书验证，仅用于测试环境。
