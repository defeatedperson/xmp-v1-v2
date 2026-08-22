// proxy包实现了基于域名的反向代理功能
// 该包可以根据请求的Host头部，将请求转发到不同的源服务器
package proxy

import (
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"xcc-lite/config"
)

// Router 结构体实现了http.Handler接口
// 它维护一个域名到反向代理的映射，用于根据请求的Host头部转发请求
type Router struct {
	origins    map[string]*httputil.ReverseProxy
	cfgs       map[string]config.DomainConfig
	pages      map[int][]byte
	startupErr error
	cache      *DiskCache
}

// NewRouter 创建一个新的Router实例
// 参数config是一个域名到源服务器URL的映射
// 返回初始化好的Router实例和可能的错误
func NewRouter(cfg map[string]config.DomainConfig, errorsDir string, startupErr error) (*Router, error) {
	origins := make(map[string]*httputil.ReverseProxy)
	pages := make(map[int][]byte)
	pages[http.StatusNotFound] = readPage(errorsDir, "404.html", "<html><body>404 Not Found</body></html>")
	pages[http.StatusInternalServerError] = readPage(errorsDir, "500.html", "<html><body>500 Internal Server Error</body></html>")
	pages[http.StatusGatewayTimeout] = readPage(errorsDir, "504.html", "<html><body>504 Gateway Timeout</body></html>")
	cacheRoot := filepath.Join(".", "cache")
	_ = os.MkdirAll(cacheRoot, 0755)
	cache := &DiskCache{root: cacheRoot}
	cfgs := make(map[string]config.DomainConfig, len(cfg))

	for domain, dc := range cfg {
		nd := normalizeDomain(domain)
		cfgs[nd] = dc
		u, err := url.Parse(dc.Origin)
		if err != nil {
			return nil, err
		}
		p := httputil.NewSingleHostReverseProxy(u)
		p.Transport = &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          1024,
			MaxIdleConnsPerHost:   256,
			MaxConnsPerHost:       512,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: dc.Timeout,
			ExpectContinueTimeout: 1 * time.Second,
			TLSClientConfig:       tlsConfigFor(u, domain, dc.OriginHost),
		}
		orig := p.Director
		p.Director = func(req *http.Request) {
			original := hostOnly(req.Host)
			orig(req)
			override := dc.OriginHost
			if override == "" {
				override = original
			}
			req.Host = override
		}
		p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			w.WriteHeader(http.StatusGatewayTimeout)
			w.Write(pages[http.StatusGatewayTimeout])
		}
		_ = cache.EnsureDomain(nd)
		ttl := dc.CacheTTL
		maxSize := dc.MaxCacheSize
		p.ModifyResponse = func(resp *http.Response) error {
			cache.Store(resp, nd, ttl, maxSize)
			return nil
		}
		origins[nd] = p
	}

	cache.StartCleanupLoop(12 * time.Hour)

	return &Router{origins: origins, cfgs: cfgs, pages: pages, startupErr: startupErr, cache: cache}, nil
}

func tlsConfigFor(u *url.URL, domain string, originHost string) *tls.Config {
	if strings.EqualFold(u.Scheme, "https") {
		name := strings.TrimSpace(originHost)
		if name == "" {
			name = normalizeDomain(domain)
		}
		return &tls.Config{
			ServerName:         name,
			InsecureSkipVerify: true,
		}
	}
	return nil
}

// hostOnly 从Host头部中提取主机名部分，去除端口号
// 参数h是完整的Host头部（可能包含端口号）
// 返回只包含主机名的字符串
func hostOnly(h string) string {
	if i := strings.IndexByte(h, ':'); i >= 0 {
		return h[:i]
	}
	return h
}

func normalizeDomain(d string) string {
	s := strings.TrimSpace(d)
	s = strings.TrimSuffix(s, ".")
	s = strings.ToLower(s)
	return s
}

// ServeHTTP 实现http.Handler接口，处理HTTP请求
// 根据请求的Host头部，将请求转发到对应的源服务器
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if r.startupErr != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write(r.pages[http.StatusInternalServerError])
		return
	}
	h := normalizeDomain(hostOnly(req.Host))
	p, ok := r.origins[h]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		w.Write(r.pages[http.StatusNotFound])
		return
	}
	dc := r.cfgs[h]
	if r.cache != nil && r.cache.Lookup(w, req, h, dc.CacheTTL) {
		return
	}
	timeout := r.cfgs[h].Timeout
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(req.Context(), timeout)
	defer cancel()
	p.ServeHTTP(w, req.WithContext(ctx))
}

func readPage(dir, name, def string) []byte {
	p := filepath.Join(dir, name)
	b, err := os.ReadFile(p)
	if err != nil || len(b) == 0 {
		return []byte(def)
	}
	return b
}
