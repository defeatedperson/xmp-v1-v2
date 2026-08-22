// admin 包实现面向本地的管理端服务，包括配置热加载、
// 缓存清理以及统计数据查询等接口，使用 mTLS 双向认证保护。
package admin

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"xcc-lite/acl"
	"xcc-lite/config"
	"xcc-lite/proxy"
	"xcc-lite/stats"
)

func LoadMTLSCertificates(certDir string) (*tls.Config, error) {
	certPath := filepath.Join(certDir, "cert.pem")
	keyPath := filepath.Join(certDir, "cert.key")
	caPath := filepath.Join(certDir, "ca.pem")

	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("加载服务器证书失败: %v", err)
	}

	caCert, err := os.ReadFile(caPath)
	if err != nil {
		return nil, fmt.Errorf("加载CA证书失败: %v", err)
	}

	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("无法解析CA证书")
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientCAs:    caCertPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
		MinVersion:   tls.VersionTLS12,
	}

	return tlsConfig, nil
}

// Start 启动管理端 HTTPS 服务。
// port 为管理端监听端口，exeDir 为程序所在目录，用于查找证书和配置。
// cfgDir 为域名配置目录，errorsDir 为错误页目录。
// agg 用于查询 5 分钟统计数据，set 回调用于热加载时替换主服务的 Handler。
func Start(port int, exeDir string, cfgDir string, errorsDir string, sslDir string, agg *stats.Aggregator, aclMgr *acl.Manager, elog *stats.EventLog, set func(http.Handler), setPolicies func(map[string]config.DomainConfig), reloadCerts func()) error {
	if port <= 0 {
		return nil
	}
	_ = os.MkdirAll(sslDir, 0755)
	certDir := filepath.Join(exeDir, "cert")
	tlsConfig, err := LoadMTLSCertificates(certDir)
	if err != nil {
		return fmt.Errorf("加载mTLS证书失败: %v", err)
	}
	// 管理端路由：重载、统计查询、缓存清理
	mux := http.NewServeMux()
	mux.HandleFunc("/admin/events/recent", func(w http.ResponseWriter, r *http.Request) {
		if elog == nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		evts, recErr := elog.Recent()
		if recErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		_ = enc.Encode(evts)
	})
	mux.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		_ = enc.Encode(struct {
			Version string `json:"version"`
		}{Version: "xcc-lite v2.0.0"})
	})
	mux.HandleFunc("/admin/acl/remove", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			List string `json:"list"`
			IP   string `json:"ip"`
		}
		dec := json.NewDecoder(r.Body)
		if de := dec.Decode(&body); de != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if body.IP == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if aclMgr == nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		switch body.List {
		case "white":
			aclMgr.RemoveWhitelist(body.IP)
		case "black":
			aclMgr.RemoveBlacklist(body.IP)
		default:
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/admin/config/apply", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			ACL          config.ACLFile `json:"acl"`
			Domains      []config.Entry `json:"domains"`
			AcmeUpstream string         `json:"acme_upstream"`
		}
		dec := json.NewDecoder(r.Body)
		if de := dec.Decode(&body); de != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if len(body.Domains) == 0 || len(body.Domains) > 10 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		dset := make(map[string]struct{})
		for _, d := range body.Domains {
			if d.Domain == "" || d.Origin == "" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			if _, ok := dset[d.Domain]; ok {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			dset[d.Domain] = struct{}{}
		}
		cfgBase := cfgDir
		confDir := cfgBase
		if filepath.Base(cfgBase) == "configs" {
			confDir = filepath.Join(filepath.Dir(cfgBase), "config")
		}
		_ = os.MkdirAll(confDir, 0755)
		_ = os.MkdirAll(cfgBase, 0755)
		ap := filepath.Join(confDir, "acl.json")
		ab, _ := json.MarshalIndent(body.ACL, "", "  ")
		if we := os.WriteFile(ap, ab, 0644); we != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		ents, re := os.ReadDir(cfgBase)
		if re != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		for _, e := range ents {
			if e.IsDir() {
				continue
			}
			if filepath.Ext(e.Name()) == ".json" {
				_ = os.Remove(filepath.Join(cfgBase, e.Name()))
			}
		}
		for _, d := range body.Domains {
			pb, _ := json.MarshalIndent(d, "", "  ")
			p := filepath.Join(cfgBase, d.Domain+".json")
			if we := os.WriteFile(p, pb, 0644); we != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
		}
		up := strings.TrimSpace(body.AcmeUpstream)
		if up != "" {
			abj, _ := json.MarshalIndent(config.ACMEConfig{Upstream: up}, "", "  ")
			ap2 := filepath.Join(confDir, "acme.json")
			if we := os.WriteFile(ap2, abj, 0644); we != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
		}
		cfg, cfgErr := config.LoadConfigs(cfgDir)
		if cfgErr != nil {
			if elog != nil {
				elog.Log("错误", map[string]interface{}{"event": "domain_config_error", "path": cfgDir, "message": cfgErr.Error()})
			}
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		var doms []string
		for d := range cfg {
			doms = append(doms, d)
		}
		if agg != nil {
			agg.SetDomains(doms)
		}
		rt, rtErr := proxy.NewRouter(cfg, errorsDir, nil)
		if rtErr != nil {
			if elog != nil {
				elog.Log("错误", map[string]interface{}{"event": "policy_reload_error", "message": rtErr.Error()})
			}
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if setPolicies != nil {
			setPolicies(cfg)
		}
		if reloadCerts != nil {
			reloadCerts()
		}
		set(rt)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/admin/certs/upload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			Domain     string `json:"domain"`
			PublicPEM  string `json:"public_pem"`
			PrivatePEM string `json:"private_pem"`
		}
		dec := json.NewDecoder(r.Body)
		if de := dec.Decode(&body); de != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if body.Domain == "" || body.PublicPEM == "" || body.PrivatePEM == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		bcrt := []byte(body.PublicPEM)
		bkey := []byte(body.PrivatePEM)
		if _, pairErr := tls.X509KeyPair(bcrt, bkey); pairErr != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		certRoot := filepath.Join(".", "certs")
		_ = os.MkdirAll(certRoot, 0755)
		dir := filepath.Join(certRoot, body.Domain)
		if mkErr := os.MkdirAll(dir, 0755); mkErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		crtPath := filepath.Join(dir, "server.crt")
		keyPath := filepath.Join(dir, "server.key")
		if we := os.WriteFile(crtPath, bcrt, 0644); we != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if we := os.WriteFile(keyPath, bkey, 0600); we != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/admin/certs/cleanup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		cfg, cfgErr := config.LoadConfigs(cfgDir)
		if cfgErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		keep := make(map[string]struct{})
		for d := range cfg {
			keep[d] = struct{}{}
		}
		certRoot := filepath.Join(".", "certs")
		_ = os.MkdirAll(certRoot, 0755)
		ents, re := os.ReadDir(certRoot)
		if re != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		for _, e := range ents {
			if !e.IsDir() {
				continue
			}
			name := e.Name()
			if name == "default" {
				continue
			}
			if _, ok := keep[name]; !ok {
				_ = os.RemoveAll(filepath.Join(certRoot, name))
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/admin/reload", func(w http.ResponseWriter, r *http.Request) {
		// 重载域名配置，成功后替换主路由
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		// 加载最新配置，包含域名数量上限校验
		_ = os.MkdirAll(cfgDir, 0755)
		cfg, cfgErr := config.LoadConfigs(cfgDir)
		if cfgErr != nil {
			if elog != nil {
				elog.Log("错误", map[string]interface{}{"event": "domain_config_error", "path": cfgDir, "message": cfgErr.Error()})
			}
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		var doms []string
		for d := range cfg {
			doms = append(doms, d)
		}
		if agg != nil {
			agg.SetDomains(doms)
		}

		rt, rtErr := proxy.NewRouter(cfg, errorsDir, nil)
		if rtErr != nil {
			if elog != nil {
				elog.Log("错误", map[string]interface{}{"event": "policy_reload_error", "message": rtErr.Error()})
			}
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if setPolicies != nil {
			setPolicies(cfg)
		}
		if reloadCerts != nil {
			reloadCerts()
		}
		set(rt)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/admin/stats/day", func(w http.ResponseWriter, r *http.Request) {
		domain := r.URL.Query().Get("domain")
		dayStr := r.URL.Query().Get("day")
		if domain == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		day, perr := strconv.Atoi(dayStr)
		if perr != nil || day < 0 || day > 6 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		now := time.Now()
		start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Add(-time.Duration(day) * 24 * time.Hour)
		end := start.Add(24 * time.Hour)
		rows, qerr := agg.QueryDomainRange(domain, start.Unix(), end.Unix())
		if qerr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		_ = enc.Encode(struct {
			Domain string      `json:"domain"`
			Day    int         `json:"day"`
			Start  int64       `json:"start"`
			End    int64       `json:"end"`
			Rows   interface{} `json:"rows"`
		}{Domain: domain, Day: day, Start: start.Unix(), End: end.Unix(), Rows: rows})
	})
	mux.HandleFunc("/admin/cache/clear", func(w http.ResponseWriter, r *http.Request) {
		// 清理指定域名的本地磁盘缓存
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			Domain string `json:"domain"`
		}
		dec := json.NewDecoder(r.Body)
		if de := dec.Decode(&body); de != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		domain := strings.TrimSpace(body.Domain)
		if domain == "" || strings.EqualFold(domain, "all") {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		domain = strings.ToLower(strings.TrimSuffix(domain, "."))
		p := filepath.Join(".", "cache", domain)
		if _, se := os.Stat(p); se == nil {
			_ = os.RemoveAll(p)
		}
		_ = os.MkdirAll(p, 0755)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	addr := ":" + strconv.Itoa(port)
	// 启动 TLS 监听
	s := &http.Server{
		Addr:      addr,
		Handler:   mux,
		TLSConfig: tlsConfig,
	}
	var ln net.Listener
	ln, err = net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	tlsLn := tls.NewListener(ln, tlsConfig)
	go s.Serve(tlsLn)
	return nil
}

// generateCert 生成自签名证书（PEM），用于本地管理端的 HTTPS 通信。
// 此函数已废弃，请使用 LoadMTLSCertificates 从外部加载证书。
