package cc

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"xcc-lite/acl"
	"xcc-lite/stats"
)

type ccKey struct {
	d string
	i string
}

type ccCtr struct {
	start int64
	count int
}

type ccShard struct {
	mu  sync.Mutex
	ctr map[ccKey]ccCtr
}

type CCRate struct {
	shards []ccShard
	acl    *acl.Manager
	log    *stats.EventLog
}

func NewCCRate(a *acl.Manager, l *stats.EventLog) *CCRate {
	n := 64
	s := make([]ccShard, n)
	for i := 0; i < n; i++ {
		s[i] = ccShard{ctr: make(map[ccKey]ccCtr)}
	}
	return &CCRate{shards: s, acl: a, log: l}
}

func (g *CCRate) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/cc/") {
			next.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/cc.js" {
			next.ServeHTTP(w, r)
			return
		}
		if acl.IsWhitelisted(r) {
			next.ServeHTTP(w, r)
			return
		}
		d := hostOnly(r.Host)
		ip := acl.ClientIP(r)
		now := time.Now().Unix()
		win := int64(60)
		max := 12
		k := ccKey{d: d, i: ip}
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
		over := c.count > max
		sh.mu.Unlock()
		if over {
			if g.log != nil {
				g.log.Log("防护", map[string]interface{}{"event": "cc_rate_limit", "domain": d, "ip": ip, "max": max, "window_secs": win})
			}
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
