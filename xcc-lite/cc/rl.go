package cc

import (
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"xcc-lite/acl"
	"xcc-lite/config"
	"xcc-lite/stats"
)

type rlKey struct {
	d string
	i string
}

type rlCtr struct {
	start int64
	count int
}

type rlShard struct {
	mu  sync.Mutex
	ctr map[rlKey]rlCtr
}

type RLGate struct {
	shards []rlShard
	cfgs   atomic.Value
	acl    *acl.Manager
	log    *stats.EventLog
}

func NewRLGate(a *acl.Manager, cfg map[string]config.DomainConfig, l *stats.EventLog) *RLGate {
	n := 64
	s := make([]rlShard, n)
	for i := 0; i < n; i++ {
		s[i] = rlShard{ctr: make(map[rlKey]rlCtr)}
	}
	g := &RLGate{shards: s, acl: a, log: l}
	g.cfgs.Store(cfg)
	return g
}

func (g *RLGate) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/cc/") {
			next.ServeHTTP(w, r)
			return
		}
		if acl.IsWhitelisted(r) {
			next.ServeHTTP(w, r)
			return
		}
		d := hostOnly(r.Host)
		cm := g.cfgs.Load().(map[string]config.DomainConfig)
		dc, ok := cm[d]
		if !ok || dc.RLMax <= 0 {
			next.ServeHTTP(w, r)
			return
		}
		ip := acl.ClientIP(r)
		now := time.Now().Unix()
		win := int64(120)
		k := rlKey{d: d, i: ip}
		idx := shardIndex(d, ip, len(g.shards))
		sh := &g.shards[idx]
		sh.mu.Lock()
		c := sh.ctr[k]
		if c.start == 0 || now-c.start >= win {
			c.start = now
			c.count = 1
		} else {
			c.count++
		}
		sh.ctr[k] = c
		over := c.count > dc.RLMax
		sh.mu.Unlock()
		if over {
			g.acl.AddBlacklist(ip)
			if g.log != nil {
				g.log.Log("防护", map[string]interface{}{"event": "rl_ban", "domain": d, "ip": ip, "rl_max": dc.RLMax, "window_secs": 120})
			}
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (g *RLGate) SetConfigs(cfg map[string]config.DomainConfig) {
	g.cfgs.Store(cfg)
}

func shardIndex(a, b string, n int) int {
	var s uint32
	for i := 0; i < len(a); i++ {
		s = s*33 + uint32(a[i])
	}
	for i := 0; i < len(b); i++ {
		s = s*33 + uint32(b[i])
	}
	return int(s & uint32(n-1))
}
