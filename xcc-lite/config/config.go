// config包实现了配置文件的加载和解析功能
// 该包从指定目录中读取所有JSON配置文件，并解析为域名到源服务器的映射
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Entry 结构体表示单个配置条目
// 每个配置文件对应一个Entry，包含域名和源服务器URL
type Entry struct {
    Domain     string `json:"domain"`
    Origin     string `json:"origin"`
    OriginHost string `json:"origin_host"`
    Timeout    int    `json:"timeout"`
    CacheTTL   int    `json:"cache_ttl"`
    CCDomain   int    `json:"cc_domain_threshold"`
    CCIP       int    `json:"cc_ip_threshold"`
    CCAllow    bool   `json:"cc_allow_interactive"`
    RLMax      int    `json:"rl_max_req"`
    HTTPSEnabled bool `json:"https_enabled"`
    RedirectToHTTPS bool `json:"redirect_http_to_https"`
    MaxCacheSize    int64  `json:"max_cache_size"`   // bytes
    CleanupInterval string `json:"cleanup_interval"` // duration string like "24h"
}

type DomainConfig struct {
    Origin     string
    OriginHost string
    Timeout    time.Duration
    CacheTTL   time.Duration
    MaxCacheSize    int64
    CleanupInterval time.Duration
    CCDomain   int
    CCIP       int
    CCAllow    bool
    RLMax      int
    HTTPSEnabled bool
    RedirectToHTTPS bool
}

// LoadConfigs 从指定目录加载所有JSON配置文件
// 参数dir是配置文件所在的目录路径
// 返回域名到源服务器URL的映射和可能的错误
func LoadConfigs(dir string) (map[string]DomainConfig, error) {
	// 初始化域名到源服务器的映射
	m := make(map[string]DomainConfig)

	// 读取目录中的所有文件和子目录（不递归）
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	// 遍历目录中的所有条目
	for _, entry := range entries {
		// 如果当前条目是目录，跳过处理
		if entry.IsDir() {
			continue
		}

		// 只处理扩展名为.json的文件
		if filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		// 构建完整的文件路径
		path := filepath.Join(dir, entry.Name())

		// 读取文件内容
		b, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}

		// 创建Entry实例并解析JSON内容
		var e Entry
		if err := json.Unmarshal(b, &e); err != nil {
			return nil, err
		}

		// 只有当域名和源服务器都不为空时，才添加到映射中
		if e.Domain != "" && e.Origin != "" {
			domain := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(e.Domain), "."))
			if domain == "" {
				continue
			}
			t := e.Timeout
			if t <= 0 {
				t = 60
			}
			var ttl time.Duration
			if e.CacheTTL > 0 {
				ttl = time.Duration(e.CacheTTL) * time.Second
			}
			cleanupInterval := 24 * time.Hour
			if e.CleanupInterval != "" {
				if d, err := time.ParseDuration(e.CleanupInterval); err == nil && d > 0 {
					cleanupInterval = d
				}
			}
			const mb = int64(1024 * 1024)
			maxCacheSize := e.MaxCacheSize
			if maxCacheSize <= 0 || maxCacheSize%mb != 0 || maxCacheSize < 1*mb || maxCacheSize > 100*mb {
				maxCacheSize = 5 * mb
			}
			m[domain] = DomainConfig{
				Origin:          e.Origin,
				OriginHost:      strings.TrimSpace(e.OriginHost),
				Timeout:         time.Duration(t) * time.Second,
				CacheTTL:        ttl,
				MaxCacheSize:    maxCacheSize,
				CleanupInterval: cleanupInterval,
				CCDomain:        e.CCDomain,
				CCIP:            e.CCIP,
				CCAllow:         e.CCAllow,
				RLMax:           e.RLMax,
				HTTPSEnabled:    e.HTTPSEnabled,
				RedirectToHTTPS: e.RedirectToHTTPS,
			}
		}
	}

	if len(m) > 10 {
		return nil, fmt.Errorf("domain limit exceeded: %d", 10)
	}
	return m, nil
}
