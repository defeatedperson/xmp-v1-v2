// proxy 包的磁盘缓存实现，用于在边缘节点落地部分 GET 响应，
// 减少回源压力并提升命中性能。
package proxy

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DiskCache 管理基于域名分片的本地磁盘缓存目录结构。
type DiskCache struct {
	root string
}

// EnsureDomain 确保域名缓存目录存在。
func (c *DiskCache) EnsureDomain(domain string) error {
	return os.MkdirAll(filepath.Join(c.root, domain), 0755)
}

// Lookup 命中并回写缓存响应，返回是否命中。
func (c *DiskCache) Lookup(w http.ResponseWriter, req *http.Request, domain string, ttl time.Duration) bool {
	if ttl <= 0 {
		return false
	}
	if req.Method != http.MethodGet && req.Method != http.MethodHead {
		return false
	}
	if bypassExt(req.URL.Path) {
		return false
	}
	key := makeKey(domain, req)
	hk := hashKey(key)
	dir := shardDir(c.root, domain, hk)
	name, exp := findCache(dir, hk)
	if name == "" {
		return false
	}
	now := time.Now().Unix()
	if exp <= now {
		return false
	}
	fp := filepath.Join(dir, name)
	meta, err := readMeta(fp + ".meta.json")
	if err != nil {
		return false
	}
	for k, v := range meta.Headers {
		w.Header().Set(k, v)
	}
	if meta.Length >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(meta.Length, 10))
	}
	// 标记命中，便于统计
	w.Header().Set("X-Cache", "HIT")
	w.WriteHeader(meta.Status)
	if req.Method != http.MethodHead {
		f, err := os.Open(fp)
		if err == nil {
			_, _ = io.Copy(w, f)
			_ = f.Close()
		}
	}
	return true
}

// Store 在响应成功时将内容与必要的头部写入缓存。
func (c *DiskCache) Store(resp *http.Response, domain string, ttl time.Duration, maxCacheSize int64) {
	if ttl <= 0 {
		return
	}
	if maxCacheSize > 0 {
		if resp.ContentLength < 0 {
			return
		}
		if resp.ContentLength > maxCacheSize {
			return
		}
	}
	req := resp.Request
	if req == nil {
		return
	}
	if req.Method != http.MethodGet {
		return
	}
	if bypassExt(req.URL.Path) {
		return
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return
	}
	key := makeKey(domain, req)
	h := hashKey(key)
	dir := shardDir(c.root, domain, h)
	_ = os.MkdirAll(dir, 0755)
	exp := time.Now().Add(ttl).Unix()
	name := h + "." + strconv.FormatInt(exp, 10)
	fp := filepath.Join(dir, name)
	f, err := os.Create(fp)
	if err != nil {
		return
	}
	meta := cacheMeta{
		Status:  resp.StatusCode,
		Headers: pickHeaders(resp.Header),
		Length:  resp.ContentLength,
	}
	_ = writeMeta(fp+".meta.json", meta)
	resp.Body = newTee(resp.Body, f)
}

// StartCleanupLoop 启动定期清理过期缓存的后台任务
func (c *DiskCache) StartCleanupLoop(interval time.Duration) {
	if interval <= 0 {
		return
	}
	cleanupOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(interval)
			defer ticker.Stop()
			for range ticker.C {
				c.cleanup()
			}
		}()
	})
}

var cleanupOnce sync.Once

func (c *DiskCache) cleanup() {
	if frac, err := diskUsageFraction(c.root); err == nil && frac >= 0.90 {
		log.Printf("cache: disk usage %.2f%% >= 90%%, clearing cache root: %s", frac*100, c.root)
		_ = os.RemoveAll(c.root)
		_ = os.MkdirAll(c.root, 0755)
		return
	}
	now := time.Now().Unix()
	_ = filepath.Walk(c.root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, ".meta.json") {
			return nil
		}
		// check filename format: hash.timestamp
		name := info.Name()
		parts := strings.Split(name, ".")
		if len(parts) < 2 {
			return nil // unknown format
		}
		// timestamp is usually the last part or second part?
		// In Store: name := h + "." + strconv.FormatInt(exp, 10)
		// h is hex string.
		tsStr := parts[len(parts)-1]
		exp, err := strconv.ParseInt(tsStr, 10, 64)
		if err != nil {
			return nil
		}
		if exp <= now {
			_ = os.Remove(path)
			_ = os.Remove(path + ".meta.json")
		}
		return nil
	})
}

// ClearDomain 清理指定域名的缓存目录并重建。
func (c *DiskCache) ClearDomain(domain string) error {
	p := filepath.Join(c.root, domain)
	if _, err := os.Stat(p); err == nil {
		_ = os.RemoveAll(p)
	}
	return os.MkdirAll(p, 0755)
}

// cacheMeta 为缓存文件的元数据：状态码、挑选的头部与长度。
type cacheMeta struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Length  int64             `json:"length"`
}

// pickHeaders 选择写入缓存文件的响应头部集合。
func pickHeaders(h http.Header) map[string]string {
	m := make(map[string]string)
	if v := h.Get("Content-Type"); v != "" {
		m["Content-Type"] = v
	}
	if v := h.Get("Content-Encoding"); v != "" {
		m["Content-Encoding"] = v
	}
	if v := h.Get("ETag"); v != "" {
		m["ETag"] = v
	}
	if v := h.Get("Last-Modified"); v != "" {
		m["Last-Modified"] = v
	}
	if v := h.Get("Cache-Control"); v != "" {
		m["Cache-Control"] = v
	}
	return m
}

// writeMeta 将缓存元数据写入 JSON 文件。
func writeMeta(path string, meta cacheMeta) error {
	b, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0644)
}

// readMeta 读取缓存元数据文件。
func readMeta(path string) (cacheMeta, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return cacheMeta{}, err
	}
	var m cacheMeta
	if err := json.Unmarshal(b, &m); err != nil {
		return cacheMeta{}, err
	}
	return m, nil
}

// bypassExt 判断动态脚本等后缀是否跳过缓存。
func bypassExt(p string) bool {
	ext := filepath.Ext(p)
	if ext == "" {
		return false
	}
	ext = strings.TrimPrefix(strings.ToLower(ext), ".")
	switch ext {
	case "php", "asp", "aspx", "jsp", "cgi", "pl", "py":
		return true
	}
	return false
}

// makeKey 构造缓存键，含方法、域名、路径、查询与编码。
func makeKey(domain string, req *http.Request) string {
	ae := strings.TrimSpace(strings.ToLower(req.Header.Get("Accept-Encoding")))
	return req.Method + "|" + domain + "|" + req.URL.Path + "|" + req.URL.RawQuery + "|" + ae
}

// hashKey 计算键的 SHA256 十六进制摘要。
func hashKey(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// shardDir 根据哈希前缀进行两级分片目录。
func shardDir(root, domain, hash string) string {
	a := hash[:2]
	b := hash[2:4]
	return filepath.Join(root, domain, a, b)
}

// findCache 在分片目录中查找带过期时间后缀的缓存文件名。
func findCache(dir, hash string) (string, int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", 0
	}
	prefix := hash + "."
	var best string
	var bestExp int64
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		parts := strings.Split(name[len(prefix):], ".")
		if len(parts) < 1 {
			continue
		}
		exp, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			continue
		}
		if exp > bestExp {
			bestExp = exp
			best = name
		}
	}
	return best, bestExp
}

// teeRC 将响应体复制到文件以落盘，同时提供 ReadCloser 接口。
type teeRC struct {
	r io.Reader
	c io.Closer
	w io.WriteCloser
}

func newTee(rc io.ReadCloser, w io.WriteCloser) io.ReadCloser {
	return &teeRC{r: io.TeeReader(rc, w), c: rc, w: w}
}

func (t *teeRC) Read(p []byte) (int, error) {
	return t.r.Read(p)
}

func (t *teeRC) Close() error {
	_ = t.w.Close()
	return t.c.Close()
}
