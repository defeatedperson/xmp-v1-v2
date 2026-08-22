package acl

import (
	"context"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Manager struct {
	mu       sync.Mutex
	white    map[string]time.Time
	black    map[string]time.Time
	swhite   map[string]struct{}
	sblack   map[string]struct{}
	whiteTTL time.Duration
	blackTTL time.Duration
}

func NewManager(whiteTTL, blackTTL time.Duration) *Manager {
	return &Manager{
		white:    make(map[string]time.Time),
		black:    make(map[string]time.Time),
		swhite:   make(map[string]struct{}),
		sblack:   make(map[string]struct{}),
		whiteTTL: whiteTTL,
		blackTTL: blackTTL,
	}
}

func (m *Manager) AddWhitelist(ip string) {
	if ip == "" {
		return
	}
	now := time.Now()
	m.mu.Lock()
	m.white[ip] = now.Add(m.whiteTTL)
	m.mu.Unlock()
}

func (m *Manager) AddBlacklist(ip string) {
	if ip == "" {
		return
	}
	now := time.Now()
	m.mu.Lock()
	m.black[ip] = now.Add(m.blackTTL)
	m.mu.Unlock()
}

func (m *Manager) RemoveBlacklist(ip string) {
	if ip == "" {
		return
	}
	m.mu.Lock()
	delete(m.black, ip)
	delete(m.sblack, ip)
	m.mu.Unlock()
}

func (m *Manager) RemoveWhitelist(ip string) {
	if ip == "" {
		return
	}
	m.mu.Lock()
	delete(m.white, ip)
	delete(m.swhite, ip)
	m.mu.Unlock()
}

func (m *Manager) SetStaticWhitelist(ips []string) {
	m.mu.Lock()
	m.swhite = make(map[string]struct{})
	for _, ip := range ips {
		if ip != "" {
			m.swhite[ip] = struct{}{}
		}
	}
	m.mu.Unlock()
}

func (m *Manager) SetStaticBlacklist(ips []string) {
	m.mu.Lock()
	m.sblack = make(map[string]struct{})
	for _, ip := range ips {
		if ip != "" {
			m.sblack[ip] = struct{}{}
		}
	}
	m.mu.Unlock()
}

type Verdict int

const (
	Unknown Verdict = iota
	Whitelisted
	Blacklisted
)

func (m *Manager) Check(ip string) Verdict {
	now := time.Now()
	m.mu.Lock()
	bexp, bok := m.black[ip]
	if bok && bexp.Before(now) {
		delete(m.black, ip)
		bok = false
	}
	wexp, wok := m.white[ip]
	if wok && wexp.Before(now) {
		delete(m.white, ip)
		wok = false
	}
	if _, ok := m.swhite[ip]; ok {
		m.mu.Unlock()
		return Whitelisted
	}
	if wok {
		m.mu.Unlock()
		return Whitelisted
	}
	if _, ok := m.sblack[ip]; ok {
		m.mu.Unlock()
		return Blacklisted
	}
	m.mu.Unlock()
	if bok {
		return Blacklisted
	}
	return Unknown
}

type ctxKey string

const whitelistKey ctxKey = "acl-whitelist"

func IsWhitelisted(r *http.Request) bool {
	v := r.Context().Value(whitelistKey)
	b, _ := v.(bool)
	return b
}

func (m *Manager) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := ClientIP(r)
		switch m.Check(ip) {
		case Blacklisted:
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		case Whitelisted:
			ctx := context.WithValue(r.Context(), whitelistKey, true)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		default:
			next.ServeHTTP(w, r)
		}
	})
}

func ClientIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		p := strings.Split(xff, ",")
		if len(p) > 0 {
			ip := strings.TrimSpace(p[0])
			if ip != "" {
				return ip
			}
		}
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && ip != "" {
		return ip
	}
	return r.RemoteAddr
}
