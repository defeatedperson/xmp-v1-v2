package cc

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"xcc-lite/acl"
)

type Manager struct {
    key  []byte
    mu   sync.Mutex
    used map[string]time.Time
    acl  *acl.Manager
    ver  map[string]vrec
}

func NewManager(a *acl.Manager) *Manager {
    k := make([]byte, 32)
    _, _ = rand.Read(k)
    m := &Manager{key: k, used: make(map[string]time.Time), acl: a, ver: make(map[string]vrec)}
    go func() {
        t := time.NewTicker(60 * time.Second)
        for {
            <-t.C
            m.cleanup()
        }
    }()
    return m
}

type vrec struct {
	scope string
	exp   time.Time
}

func (m *Manager) markVerified(domain, ip, scope string) {
    k := domain + "|" + ip
    m.mu.Lock()
    m.ver[k] = vrec{scope: scope, exp: time.Now().Add(3 * time.Minute)}
    m.mu.Unlock()
}

func (m *Manager) TakeVerified(domain, ip string) (string, bool) {
    k := domain + "|" + ip
    m.mu.Lock()
    v, ok := m.ver[k]
    if ok {
        if v.exp.Before(time.Now()) {
            delete(m.ver, k)
            ok = false
        } else {
            delete(m.ver, k)
        }
    }
    m.mu.Unlock()
    if !ok {
        return "", false
    }
    return v.scope, true
}

func (m *Manager) cleanup() {
    now := time.Now()
    m.mu.Lock()
    for k, exp := range m.used {
        if exp.Before(now) {
            delete(m.used, k)
        }
    }
    if len(m.used) > 100000 {
        n := len(m.used) - 100000
        for k := range m.used {
            delete(m.used, k)
            n--
            if n <= 0 {
                break
            }
        }
    }
    for k, v := range m.ver {
        if v.exp.Before(now) {
            delete(m.ver, k)
        }
    }
    if len(m.ver) > 100000 {
        n := len(m.ver) - 100000
        for k := range m.ver {
            delete(m.ver, k)
            n--
            if n <= 0 {
                break
            }
        }
    }
    m.mu.Unlock()
}

func (m *Manager) setVerifiedCookie(w http.ResponseWriter, domain, scope string, ttl time.Duration) {
	now := time.Now().Unix()
	exp := now + int64(ttl/time.Second)
	j := make([]byte, 16)
	_, _ = rand.Read(j)
	p := payload{Iss: "xcc-lite", Aud: domain, Iat: now, Exp: exp, Jti: b64(j), Type: "verified", Level: 0, U: "", IP: "", Sc: scope}
	t, err := m.sign(p)
	if err != nil {
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "__xcc_cc_verified", Value: t, Path: "/", MaxAge: int(ttl / time.Second), HttpOnly: true, SameSite: http.SameSiteLaxMode})
}

func (m *Manager) VerifiedScope(r *http.Request, domain string) (string, bool) {
	ck, err := r.Cookie("__xcc_cc_verified")
	if err != nil {
		return "", false
	}
	p, ok := m.parse(ck.Value)
	if !ok {
		return "", false
	}
	if p.Type != "verified" {
		return "", false
	}
	if p.Exp < time.Now().Unix() {
		return "", false
	}
	if p.Aud != domain {
		return "", false
	}
	return p.Sc, true
}

type payload struct {
	Iss   string `json:"iss"`
	Aud   string `json:"aud"`
	Iat   int64  `json:"iat"`
	Exp   int64  `json:"exp"`
	Jti   string `json:"jti"`
	Type  string `json:"type"`
	Level int    `json:"level"`
	U     string `json:"u"`
	A     int    `json:"a"`
	B     int    `json:"b"`
	C     int    `json:"c"`
	IP    string `json:"ip"`
	Sc    string `json:"sc"`
	Pre   string `json:"pre"`
	S     string `json:"s"`
}

func b64(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func ub64(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}

func (m *Manager) sign(p payload) (string, error) {
	b, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, m.key)
	mac.Write(b)
	sig := mac.Sum(nil)
	return b64(b) + "." + b64(sig), nil
}

func (m *Manager) parse(token string) (payload, bool) {
	i := strings.LastIndexByte(token, '.')
	if i <= 0 {
		return payload{}, false
	}
	pb, err := ub64(token[:i])
	if err != nil {
		return payload{}, false
	}
	sb, err := ub64(token[i+1:])
	if err != nil {
		return payload{}, false
	}
	mac := hmac.New(sha256.New, m.key)
	mac.Write(pb)
	if !hmac.Equal(mac.Sum(nil), sb) {
		return payload{}, false
	}
	var p payload
	if err := json.Unmarshal(pb, &p); err != nil {
		return payload{}, false
	}
	return p, true
}

func randInt(max int64) int {
	if max <= 0 {
		return 0
	}
	n, err := rand.Int(rand.Reader, big.NewInt(max))
	if err != nil {
		return 0
	}
	return int(n.Int64())
}

func hostOnly(h string) string {
	if i := strings.IndexByte(h, ':'); i >= 0 {
		return h[:i]
	}
	return h
}

func (m *Manager) InteractivePage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	p := filepath.Join(".", "errors", "cc-interactive.html")
	b, err := os.ReadFile(p)
	if err == nil && len(b) > 0 {
		w.Write(b)
		return
	}
	io.WriteString(w, "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Verify</title></head><body><div id=\"v\"></div><input id=\"ans\" type=\"text\" style=\"display:none\"><button id=\"ok\" style=\"display:none\">OK</button><script>var ready=0;var expr='';var token='';function setMove(){if(!ready){ready=1;document.cookie='__xcc_cc_move=1; Max-Age=600; Path=/; SameSite=Lax';}}document.addEventListener('mousemove',setMove);document.addEventListener('keydown',setMove);document.addEventListener('scroll',setMove);function init(){var u=new URLSearchParams(window.location.search).get('u')||'/';fetch('/cc/init?u='+encodeURIComponent(u),{method:'POST'}).then(function(r){return r.json()}).then(function(j){expr=j.expr;token=j.token;document.getElementById('v').innerText=expr;document.getElementById('ans').style.display='block';document.getElementById('ok').style.display='inline-block';});}function verify(){var a=document.getElementById('ans').value;fetch('/cc/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token,answer:a})}).then(function(r){return r.json()}).then(function(j){if(j&&j.ok&&j.redirect){location.href=j.redirect;}else{location.reload();}});}init();document.getElementById('ok').onclick=verify;</script></body></html>")
}

func (m *Manager) Init(w http.ResponseWriter, r *http.Request) {
	ip := acl.ClientIP(r)
	d := hostOnly(r.Host)
	u := r.URL.Query().Get("u")
	if u == "" {
		u = "/"
	}
	sc := r.URL.Query().Get("scope")
	if sc == "" {
		sc = "domain"
	}
	a := 1 + randInt(9)
	b := 1 + randInt(9)
	c := 10 + randInt(90)
	now := time.Now().Unix()
	exp := now + 120
	j := make([]byte, 16)
	_, _ = rand.Read(j)
	p := payload{Iss: "xcc-lite", Aud: d, Iat: now, Exp: exp, Jti: b64(j), Type: "interactive", Level: 1, U: u, A: a, B: b, C: c, IP: ip, Sc: sc}
	t, err := m.sign(p)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "__xcc_cc_token", Value: t, Path: "/", MaxAge: 120, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	w.Header().Set("Content-Type", "application/json")
	resp := struct {
		Token string `json:"token"`
		Expr  string `json:"expr"`
	}{Token: t, Expr: "(" + strconv.Itoa(a) + "*" + strconv.Itoa(b) + ")+" + strconv.Itoa(c)}
	enc := json.NewEncoder(w)
	_ = enc.Encode(resp)
}

func (m *Manager) Verify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token  string `json:"token"`
		Answer string `json:"answer"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	ck, err := r.Cookie("__xcc_cc_token")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	ct := ck.Value
	cb := []byte(ct)
	bb := []byte(body.Token)
	if len(cb) != len(bb) || !hmac.Equal(cb, bb) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	p, ok := m.parse(body.Token)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if p.Type != "interactive" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if p.Exp < time.Now().Unix() {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	ip := acl.ClientIP(r)
	if ip != p.IP {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	m.mu.Lock()
	if _, used := m.used[p.Jti]; used {
		m.mu.Unlock()
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	m.used[p.Jti] = time.Now().Add(5 * time.Minute)
	m.mu.Unlock()
	ans := strings.TrimSpace(body.Answer)
	if ans == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	exp := p.A*p.B + p.C
	okAns := false
	if n, err := json.Number(ans).Int64(); err == nil {
		okAns = int(n) == exp
	}
	if !okAns {
		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		_ = enc.Encode(struct {
			Ok bool `json:"ok"`
		}{Ok: false})
		return
	}
	m.markVerified(p.Aud, ip, p.Sc)
	m.setVerifiedCookie(w, p.Aud, p.Sc, 10*time.Minute)
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	_ = enc.Encode(struct {
		Ok       bool   `json:"ok"`
		Redirect string `json:"redirect"`
	}{Ok: true, Redirect: p.U})
}
