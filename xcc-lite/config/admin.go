// config 包的 admin 子模块负责管理端配置文件的读取与解析。
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"encoding/json"
)

// AdminConfig 表示管理端的基础配置。
type AdminConfig struct {
	Port         int
	ACMEUpstream string
}

func LoadAdminConfigFromEnv(exeDir string) (AdminConfig, error) {
	envPath := filepath.Join(exeDir, ".env")
	data, err := os.ReadFile(envPath)
	if err != nil {
		return AdminConfig{}, fmt.Errorf("读取配置文件失败: %v，请创建.env文件", err)
	}

	var config AdminConfig
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "PORT=") && len(line) > 5 {
			portStr := strings.TrimPrefix(line, "PORT=")
			if _, err := fmt.Sscanf(portStr, "%d", &config.Port); err != nil {
				return AdminConfig{}, fmt.Errorf("解析PORT失败: %v", err)
			}
			if config.Port > 0 {
				return config, nil
			}
		}
	}
	return AdminConfig{}, fmt.Errorf("未找到有效的PORT配置")
}

type ACLFile struct {
	Whitelist []string `json:"whitelist"`
	Blacklist []string `json:"blacklist"`
}

func LoadIPLists(dir string) ([]string, []string, error) {
    cfgDir := dir
    if filepath.Base(dir) == "configs" {
        cfgDir = filepath.Join(filepath.Dir(dir), "config")
    }
    p := filepath.Join(cfgDir, "acl.json")
    b, err := os.ReadFile(p)
    if err != nil {
        return nil, nil, err
    }
    if len(b) == 0 {
        return []string{}, []string{}, nil
    }
    var f ACLFile
    if err := json.Unmarshal(b, &f); err != nil {
        return nil, nil, err
    }
    return f.Whitelist, f.Blacklist, nil
}

type ACMEConfig struct {
    Upstream string `json:"upstream"`
}

func LoadACMEUpstream(dir string) (string, error) {
    cfgDir := dir
    if filepath.Base(dir) == "configs" {
        cfgDir = filepath.Join(filepath.Dir(dir), "config")
    }
    p := filepath.Join(cfgDir, "acme.json")
    b, err := os.ReadFile(p)
    if err != nil {
        return "", err
    }
    var c ACMEConfig
    if err := json.Unmarshal(b, &c); err != nil {
        return "", err
    }
    return strings.TrimSpace(c.Upstream), nil
}
