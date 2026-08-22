// CDN 边缘代理服务主程序
// 负责加载域名配置、启动反向代理与管理端，并在入口处挂载统计中间件。
package main

import (
	"crypto/tls"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"xcc-lite/acl"
	"xcc-lite/admin"
	"xcc-lite/cc"
	"xcc-lite/certs"
	"xcc-lite/config"
	"xcc-lite/proxy"
	"xcc-lite/stats"
)

func main() {
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("获取程序路径失败: ", err)
	}
	exeDir := filepath.Dir(exePath)
	dir := filepath.Join(exeDir, "configs")
	_ = os.MkdirAll(dir, 0755)
	errorsDir := filepath.Join(exeDir, "errors")
	// 加载域名配置，包含域名数量上限校验
	conf, err := config.LoadConfigs(dir)
	var startupErr error
	if err != nil {
		startupErr = err
		conf = make(map[string]config.DomainConfig)
	}
	r, err := proxy.NewRouter(conf, errorsDir, startupErr)
	if err != nil {
		log.Fatal(err)
	}

	var current atomic.Value
	current.Store(http.Handler(r))
	dynamic := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		h := current.Load().(http.Handler)
		h.ServeHTTP(w, req)
	})

	var redirCfg atomic.Value
	redirCfg.Store(conf)

	var acmeUpstream string

	// 初始化统计数据库到程序目录下的 database
	dbDir := filepath.Join(exeDir, "database")
	_ = os.MkdirAll(dbDir, 0755)
	agg, aerr := stats.New(filepath.Join(dbDir, "metrics.db"))
	if aerr != nil {
		log.Fatal(aerr)
	}
	var doms []string
	for d := range conf {
		doms = append(doms, d)
	}
	agg.SetDomains(doms)

	aclMgr := acl.NewManager(30*time.Minute, 10*time.Minute)
	{
		cfgDir := filepath.Join(exeDir, "config")
		if wl, bl, err := config.LoadIPLists(cfgDir); err == nil {
			if len(wl) > 0 {
				aclMgr.SetStaticWhitelist(wl)
			}
			if len(bl) > 0 {
				aclMgr.SetStaticBlacklist(bl)
			}
		}
	}

	mux80 := http.NewServeMux()
	mux443 := http.NewServeMux()
	elog, _ := stats.NewEventLog()
	ccMgr := cc.NewManager(aclMgr)
	// 注册 CC 相关路由到两个端口的 mux
	mux80.HandleFunc("/cc/interactive", func(w http.ResponseWriter, r *http.Request) { ccMgr.InteractivePage(w, r) })
	mux80.HandleFunc("/cc/init", func(w http.ResponseWriter, r *http.Request) { ccMgr.Init(w, r) })
	mux80.HandleFunc("/cc/verify", func(w http.ResponseWriter, r *http.Request) { ccMgr.Verify(w, r) })
	mux80.HandleFunc("/cc.js", func(w http.ResponseWriter, r *http.Request) { ccMgr.JS(w, r) })
	mux80.HandleFunc("/cc/pow", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowPage(w, r) })
	mux80.HandleFunc("/cc/pow/init", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowInit(w, r) })
	mux80.HandleFunc("/cc/pow/verify", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowVerify(w, r) })
	mux80.HandleFunc("/cc/pow/degrade", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowDegrade(w, r) })
	mux80.HandleFunc("/cc/pow/recheck", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowRecheck(w, r) })
	mux443.HandleFunc("/cc/interactive", func(w http.ResponseWriter, r *http.Request) { ccMgr.InteractivePage(w, r) })
	mux443.HandleFunc("/cc/init", func(w http.ResponseWriter, r *http.Request) { ccMgr.Init(w, r) })
	mux443.HandleFunc("/cc/verify", func(w http.ResponseWriter, r *http.Request) { ccMgr.Verify(w, r) })
	mux443.HandleFunc("/cc.js", func(w http.ResponseWriter, r *http.Request) { ccMgr.JS(w, r) })
	mux443.HandleFunc("/cc/pow", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowPage(w, r) })
	mux443.HandleFunc("/cc/pow/init", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowInit(w, r) })
	mux443.HandleFunc("/cc/pow/verify", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowVerify(w, r) })
	mux443.HandleFunc("/cc/pow/degrade", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowDegrade(w, r) })
	mux443.HandleFunc("/cc/pow/recheck", func(w http.ResponseWriter, r *http.Request) { ccMgr.PowRecheck(w, r) })
	rlGate := cc.NewRLGate(aclMgr, conf, elog)
	domGate := cc.NewDomainGate(ccMgr, aclMgr, conf, elog)
	ipGate := cc.NewIPGate(ccMgr, aclMgr, conf, elog)
	ccRate := cc.NewCCRate(aclMgr, elog)
	redirectMW := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/cc/") || strings.HasPrefix(r.URL.Path, "/.well-known/acme-challenge/") {
				next.ServeHTTP(w, r)
				return
			}
			if r.TLS == nil {
				d := r.Host
				if i := strings.IndexByte(d, ':'); i >= 0 {
					d = d[:i]
				}
				d = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(d), "."))
				cfgm := redirCfg.Load().(map[string]config.DomainConfig)
				if dc, ok := cfgm[d]; ok {
					if dc.HTTPSEnabled && dc.RedirectToHTTPS {
						u := "https://" + r.Host + r.URL.String()
						http.Redirect(w, r, u, http.StatusMovedPermanently)
						return
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}

	acmeMW := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.TLS == nil && strings.HasPrefix(r.URL.Path, "/.well-known/acme-challenge/") {
				up := strings.TrimSpace(acmeUpstream)
				if up != "" {
					u, perr := url.Parse(up)
					if perr == nil {
						p := httputil.NewSingleHostReverseProxy(u)
						p.ServeHTTP(w, r)
						return
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
	// 80 端口链路：ACL -> ACME -> RL -> Domain -> IP -> Redirect -> Stats -> Dynamic
	mux80.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		aclMgr.Handler(ccRate.Handler(acmeMW(rlGate.Handler(domGate.Handler(ipGate.Handler(redirectMW(agg.Handler(dynamic)))))))).ServeHTTP(w, r)
	})
	// 443 端口链路：ACL -> RL -> Domain -> IP -> Stats -> Dynamic
	mux443.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		aclMgr.Handler(ccRate.Handler(rlGate.Handler(domGate.Handler(ipGate.Handler(agg.Handler(dynamic)))))).ServeHTTP(w, r)
	})
	s80 := &http.Server{Addr: ":80", Handler: mux80}
	certDir := filepath.Join(exeDir, "certs")
	cm, cmErr := certs.New(certDir)
	if cmErr != nil {
		log.Fatal(cmErr)
	}
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: cm.GetCertificate}
	s443 := &http.Server{Addr: ":443", Handler: mux443, TLSConfig: tlsCfg}

	// 启动管理端（HTTPS），提供重载、缓存清理与统计查询接口
	adminConf, aerr := config.LoadAdminConfigFromEnv(exeDir)
	if aerr != nil {
		log.Fatal(aerr)
	}
	acmeUpstream = ""
	if up, uerr := config.LoadACMEUpstream(dir); uerr == nil {
		acmeUpstream = strings.TrimSpace(up)
	}
	sslDir := filepath.Join(exeDir, "ssl")
	if err := admin.Start(adminConf.Port, exeDir, dir, errorsDir, sslDir, agg, aclMgr, elog, func(h http.Handler) {
		current.Store(h)
	}, func(cfg map[string]config.DomainConfig) {
		rlGate.SetConfigs(cfg)
		domGate.SetConfigs(cfg)
		ipGate.SetConfigs(cfg)
		redirCfg.Store(cfg)
		cfgDir := filepath.Join(exeDir, "config")
		if wl, bl, err := config.LoadIPLists(cfgDir); err == nil {
			if len(wl) > 0 {
				aclMgr.SetStaticWhitelist(wl)
			}
			if len(bl) > 0 {
				aclMgr.SetStaticBlacklist(bl)
			}
		} else {
			if elog != nil {
				elog.Log("错误", map[string]interface{}{"event": "acl_config_error", "path": filepath.Join(cfgDir, "acl.json"), "message": err.Error()})
			}
		}
		if up, uerr := config.LoadACMEUpstream(dir); uerr == nil {
			acmeUpstream = strings.TrimSpace(up)
		}
	}, func() {
		_ = cm.Reload()
	}); err != nil {
		log.Fatal(err)
	}

	ln80, e80 := net.Listen("tcp", s80.Addr)
	if e80 != nil {
		log.Fatal(e80)
	}
	go s80.Serve(ln80)
	ln443, e443 := net.Listen("tcp", s443.Addr)
	if e443 != nil {
		log.Fatal(e443)
	}
	tlsLn := tls.NewListener(ln443, tlsCfg)
	go s443.Serve(tlsLn)
	select {}
}
