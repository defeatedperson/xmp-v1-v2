package cc

import (
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"xcc-lite/acl"
	"xcc-lite/config"
	"xcc-lite/stats"
)

type ipKey struct {
	d string
	i string
}

type ipCtr struct {
	start int64
	count int
}

type IPGate struct {
	mu   sync.Mutex
	ctr  map[ipKey]ipCtr
	sess map[ipKey]int64
	cfgs map[string]config.DomainConfig
	cc   *Manager
	acl  *acl.Manager
	log  *stats.EventLog
}

func NewIPGate(ccm *Manager, a *acl.Manager, cfg map[string]config.DomainConfig, l *stats.EventLog) *IPGate {
	return &IPGate{ctr: make(map[ipKey]ipCtr), sess: make(map[ipKey]int64), cfgs: cfg, cc: ccm, acl: a, log: l}
}

func (g *IPGate) Handler(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if strings.HasPrefix(r.URL.Path, "/cc/") || strings.HasPrefix(r.URL.Path, "/.well-known/acme-challenge/") {
            next.ServeHTTP(w, r)
            return
        }
		if acl.IsWhitelisted(r) {
			next.ServeHTTP(w, r)
			return
		}
		d := hostOnly(r.Host)
		ip := acl.ClientIP(r)
		dc, ok := g.cfgs[d]
		if !ok || dc.CCIP <= 0 {
			next.ServeHTTP(w, r)
			return
		}

		if g.cc != nil {
			if _, okv := g.cc.TakeVerified(d, ip); okv {
				g.mu.Lock()
				delete(g.sess, ipKey{d, ip})
				delete(g.ctr, ipKey{d, ip})
				g.mu.Unlock()
				next.ServeHTTP(w, r)
				return
			}
		}
		now := time.Now().Unix()
		win := int64(30)
		k := ipKey{d, ip}
		g.mu.Lock()
		if s, has := g.sess[k]; has {
			if now-s >= 120 {
				g.mu.Unlock()
				g.acl.AddBlacklist(ip)
				if g.log != nil {
					g.log.Log("防护", map[string]interface{}{"event": "ip_blacklisted", "domain": d, "ip": ip, "reason": "timeout_120s"})
				}
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			g.mu.Unlock()
			u := r.URL.String()
			if g.log != nil {
				if g.domainSessionCount(d) > 10 {
					g.log.Log("防护", map[string]interface{}{"event": "ip_overflow", "domain": d, "unique_ip_count": g.domainSessionCount(d)})
				} else {
					g.log.Log("记录", map[string]interface{}{"event": "challenge_sent", "domain": d, "ip": ip, "scope": "ip"})
				}
			}
            if dc.CCAllow {
                http.Redirect(w, r, "/cc/interactive?scope=ip&u="+url.QueryEscape(u), http.StatusSeeOther)
            } else {
                http.Redirect(w, r, "/cc/pow?scope=ip&p=1&u="+url.QueryEscape(u), http.StatusSeeOther)
            }
			return
		}
		c := g.ctr[k]
		if c.start == 0 || now-c.start >= win {
			c.start = now
			c.count = 1
		} else {
			c.count++
		}
		g.ctr[k] = c
		over := c.count > dc.CCIP
		if over {
			g.sess[k] = now
			g.mu.Unlock()
			u := r.URL.String()
			if g.log != nil {
				if g.domainSessionCount(d) > 10 {
					g.log.Log("防护", map[string]interface{}{"event": "ip_overflow", "domain": d, "unique_ip_count": g.domainSessionCount(d)})
				} else {
					g.log.Log("记录", map[string]interface{}{"event": "challenge_sent", "domain": d, "ip": ip, "scope": "ip"})
				}
			}
            if dc.CCAllow {
                http.Redirect(w, r, "/cc/interactive?scope=ip&u="+url.QueryEscape(u), http.StatusSeeOther)
            } else {
                http.Redirect(w, r, "/cc/pow?scope=ip&p=1&u="+url.QueryEscape(u), http.StatusSeeOther)
            }
			return
		}
		g.mu.Unlock()
		next.ServeHTTP(w, r)
	})
}

func (g *IPGate) domainSessionCount(domain string) int {
	n := 0
	for k := range g.sess {
		if k.d == domain {
			n++
		}
	}
	return n
}

func (g *IPGate) SetConfigs(cfg map[string]config.DomainConfig) {
	g.mu.Lock()
	g.cfgs = cfg
	g.mu.Unlock()
}
