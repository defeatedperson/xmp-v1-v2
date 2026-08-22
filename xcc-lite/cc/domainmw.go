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

type domCtr struct {
	start int64
	count int
}

type DomainGate struct {
	mu   sync.Mutex
	ctr  map[string]domCtr
	hold map[string]int64
	sess map[string]int64
	cfgs map[string]config.DomainConfig
	cc   *Manager
	acl  *acl.Manager
	log  *stats.EventLog
}

func NewDomainGate(ccm *Manager, a *acl.Manager, cfg map[string]config.DomainConfig, l *stats.EventLog) *DomainGate {
	return &DomainGate{ctr: make(map[string]domCtr), hold: make(map[string]int64), sess: make(map[string]int64), cfgs: cfg, cc: ccm, acl: a, log: l}
}

func (g *DomainGate) Handler(next http.Handler) http.Handler {
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
		dc, ok := g.cfgs[d]
		if !ok || dc.CCDomain <= 0 {
			next.ServeHTTP(w, r)
			return
		}
		if g.cc != nil {
			if _, ok := g.cc.VerifiedScope(r, d); ok {
				next.ServeHTTP(w, r)
				return
			}
		}
		ip := acl.ClientIP(r)
		if g.cc != nil {
			if sc, okv := g.cc.TakeVerified(d, ip); okv {
				if sc == "domain" {
					next.ServeHTTP(w, r)
					return
				}
			}
		}
		now := time.Now().Unix()
		holdUntil := g.hold[d]
		if holdUntil > 0 && now < holdUntil {
			k := d + "|" + ip
			g.mu.Lock()
			if s, has := g.sess[k]; has {
				if now-s >= 120 {
					g.mu.Unlock()
					g.acl.AddBlacklist(ip)
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				g.mu.Unlock()
				u := r.URL.String()
            if dc.CCAllow {
                http.Redirect(w, r, "/cc/interactive?scope=domain&u="+url.QueryEscape(u), http.StatusSeeOther)
            } else {
                http.Redirect(w, r, "/cc/pow?scope=domain&p=1&u="+url.QueryEscape(u), http.StatusSeeOther)
            }
				return
			}
			g.sess[k] = now
			g.mu.Unlock()
			u := r.URL.String()
            if dc.CCAllow {
                http.Redirect(w, r, "/cc/interactive?scope=domain&u="+url.QueryEscape(u), http.StatusSeeOther)
            } else {
                http.Redirect(w, r, "/cc/pow?scope=domain&p=1&u="+url.QueryEscape(u), http.StatusSeeOther)
            }
			return
		}
		win := int64(30)
		c := g.ctr[d]
		if c.start == 0 || now-c.start >= win {
			c.start = now
			c.count = 1
		} else {
			c.count++
		}
		g.ctr[d] = c
		over := c.count > dc.CCDomain
		if over {
			g.hold[d] = now + 600
			k := d + "|" + ip
			g.sess[k] = now
			if g.log != nil {
				g.log.Log("防护", map[string]interface{}{"event": "domain_hold_start", "domain": d, "threshold": dc.CCDomain, "window_secs": 30})
			}
			u := r.URL.String()
            if dc.CCAllow {
                http.Redirect(w, r, "/cc/interactive?scope=domain&u="+url.QueryEscape(u), http.StatusSeeOther)
            } else {
                http.Redirect(w, r, "/cc/pow?scope=domain&p=1&u="+url.QueryEscape(u), http.StatusSeeOther)
            }
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (g *DomainGate) SetConfigs(cfg map[string]config.DomainConfig) {
	g.mu.Lock()
	g.cfgs = cfg
	g.mu.Unlock()
}
