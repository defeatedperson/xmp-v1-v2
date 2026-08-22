package cc

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"xcc-lite/acl"
)

func (m *Manager) JS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Write([]byte(`(function(){function h(b){return Array.from(new Uint8Array(b)).map(function(x){return ('0'+x.toString(16)).slice(-2)}).join('')}function goDegrade(u,sc){location.href='/cc/pow/degrade?scope='+encodeURIComponent(sc||'domain')+'&u='+encodeURIComponent(u)}async function pow(token,salt,prefix,u,sc){if(!(self.crypto&&crypto.subtle&&crypto.subtle.digest)){goDegrade(u,sc);return}let nonce=0;var enc=new TextEncoder();let start=Date.now();let budget=8000;function ok(hex){return hex.startsWith(prefix)}while(true){let data=enc.encode(salt+":"+token+":"+nonce);let d;try{d=await crypto.subtle.digest('SHA-256',data)}catch(_){goDegrade(u,sc);return}let hex=h(d);if(ok(hex)){break}nonce++;if(Date.now()-start>budget){break}}try{let res=await fetch('/cc/pow/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token,nonce:nonce})});let j=await res.json();if(j&&j.ok&&j.redirect){location.href=j.redirect}else{goDegrade(u,sc)}}catch(_){goDegrade(u,sc)}}async function init(){var qs=new URLSearchParams(location.search);var u=qs.get('u')||location.href;var sc=qs.get('scope')||'domain';var p=qs.get('p')||'';try{let res=await fetch('/cc/pow/init?u='+encodeURIComponent(u)+'&scope='+encodeURIComponent(sc)+'&p='+encodeURIComponent(p),{method:'POST'});let j=await res.json();if(!j||!j.token||!j.prefix||!j.salt){goDegrade(u,sc);return}pow(j.token,j.salt,j.prefix,j.u||u,sc)}catch(_){goDegrade(u,sc)}}init()})();`))
}

func (m *Manager) PowPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Verify</title></head><body><script src=\"/cc.js\"></script></body></html>"))
}

func (m *Manager) PowInit(w http.ResponseWriter, r *http.Request) {
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
	pre := "0000"
	sb := make([]byte, 16)
	_, _ = rand.Read(sb)
	salt := base64.RawURLEncoding.EncodeToString(sb)
	now := time.Now().Unix()
	exp := now + 120
	j := make([]byte, 16)
	_, _ = rand.Read(j)
	pflag := r.URL.Query().Get("p")
	if pflag == "1" {
		if sc == "domain" {
			pre = "000000"
		} else {
			pre = "00000"
		}
	}
	p := payload{Iss: "xcc-lite", Aud: d, Iat: now, Exp: exp, Jti: b64(j), Type: "pow", Level: 1, U: u, IP: ip, Sc: sc, Pre: pre, S: salt}
	t, err := m.sign(p)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "__xcc_cc_token", Value: t, Path: "/", MaxAge: 120, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	_ = enc.Encode(struct {
		Token  string `json:"token"`
		Prefix string `json:"prefix"`
		Salt   string `json:"salt"`
		U      string `json:"u"`
	}{Token: t, Prefix: pre, Salt: salt, U: u})
}

func (m *Manager) PowVerify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
		Nonce int    `json:"nonce"`
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
	if p.Type != "pow" {
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
	data := []byte(p.S + ":" + body.Token + ":" + strconv.Itoa(body.Nonce))
	sum := sha256.Sum256(data)
	hexed := hex.EncodeToString(sum[:])
	if !strings.HasPrefix(hexed, p.Pre) {
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

func (m *Manager) PowDegrade(w http.ResponseWriter, r *http.Request) {
	u := r.URL.Query().Get("u")
	if u == "" {
		u = "/"
	}
	sc := r.URL.Query().Get("scope")
	if sc == "" {
		sc = "domain"
	}
	http.SetCookie(w, &http.Cookie{Name: "__xcc_cc_probe", Value: "1", Path: "/", MaxAge: 120, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	http.Redirect(w, r, "/cc/pow/recheck?scope="+sc+"&u="+u, http.StatusFound)
}

func (m *Manager) PowRecheck(w http.ResponseWriter, r *http.Request) {
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
	_, err := r.Cookie("__xcc_cc_probe")
	if err != nil {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "__xcc_cc_probe", Value: "", Path: "/", MaxAge: 0, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	m.markVerified(d, ip, sc)
	m.setVerifiedCookie(w, d, sc, 10*time.Minute)
	http.Redirect(w, r, u, http.StatusFound)
}
