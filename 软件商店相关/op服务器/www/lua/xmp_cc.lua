-- 极简 CC 防护（OpenResty + Lua，单机内存版）
-- 站点通过 Nginx 变量声明启用（放在 /www/web-rules/<domain>/*.conf 内即可）：
--   - $xmp_cc_on=1                       启用
--   - $xmp_cc_ip_x=NUM                   30 秒内请求数 >x 封禁 10 分钟（444）
--   - $xmp_cc_domain_y=NUM               30 秒内域名总请求数 >=y 进入验证期 10 分钟
--   - $xmp_cc_strict=0|1                 0 允许降级；1 严格模式（不允许降级，异常计失败）
-- 挑战入口：
--   /__cc /__cc.js /__cc/init /__cc/verify /__cc/degrade /__cc/recheck

local cjson = require "cjson.safe"
local str = require "resty.string"

local M = {}

local function starts_with(s, prefix)
  return s ~= nil and prefix ~= nil and s:sub(1, #prefix) == prefix
end

local function now_s()
  return ngx.time()
end

local function get_bucket(seconds)
  return math.floor(now_s() / seconds)
end

local function to_int(v)
  if v == nil then
    return nil
  end
  local n = tonumber(v)
  if n == nil then
    return nil
  end
  return math.floor(n)
end

local function rand_bytes(n)
  local ok, random = pcall(require, "resty.random")
  if ok and random and random.bytes then
    return random.bytes(n, true)
  end
  math.randomseed((ngx.now() * 1000) + (ngx.worker.pid() or 0))
  local t = {}
  for i = 1, n do
    t[i] = string.char(math.random(0, 255))
  end
  return table.concat(t)
end

local function b64url(b)
  local s = ngx.encode_base64(b)
  s = s:gsub("+", "-"):gsub("/", "_"):gsub("=", "")
  return s
end

local function json_out(status, obj)
  ngx.status = status
  ngx.header["Content-Type"] = "application/json; charset=utf-8"
  ngx.say(cjson.encode(obj or {}))
  return ngx.exit(status)
end

local function add_set_cookie(cookie_str)
  if not cookie_str or cookie_str == "" then
    return
  end
  local cur = ngx.header["Set-Cookie"]
  if cur == nil then
    ngx.header["Set-Cookie"] = { cookie_str }
    return
  end
  if type(cur) == "string" then
    ngx.header["Set-Cookie"] = { cur, cookie_str }
    return
  end
  if type(cur) == "table" then
    table.insert(cur, cookie_str)
    ngx.header["Set-Cookie"] = cur
  end
end

local function get_site_cfg()
  local on = ngx.var.xmp_cc_on
  if on ~= "1" then
    return nil
  end

  local ip_x = to_int(ngx.var.xmp_cc_ip_x) or 0
  local domain_y = to_int(ngx.var.xmp_cc_domain_y) or 0
  local strict = to_int(ngx.var.xmp_cc_strict) or 0

  return {
    ip_x = ip_x,
    domain_y = domain_y,
    strict = strict,
  }
end

local function client_ip()
  return ngx.var.remote_addr or ""
end

local function host_only()
  return ngx.var.host or ""
end

local function is_bypass_path(uri)
  if uri == nil then
    return false
  end
  if starts_with(uri, "/__cc") then
    return true
  end
  if starts_with(uri, "/.well-known/acme-challenge/") then
    return true
  end
  return false
end

local function normalize_u(u)
  local s = u or "/"
  if s == "" then
    s = "/"
  end

  s = s:gsub("[\r\n]", "")

  for _ = 1, 3 do
    local dec = ngx.unescape_uri(s)
    if dec == s then
      break
    end
    s = dec
  end

  if not starts_with(s, "/") then
    s = "/" .. s
  end

  s = s:gsub("^/+", "/")
  return s
end

local function dict_get(name)
  local d = ngx.shared[name]
  if not d then
    ngx.log(ngx.ERR, "xmp-cc: missing lua_shared_dict: ", name)
  end
  return d
end

local function dict_incr_window(dict, key, window_secs)
  local val, err = dict:incr(key, 1, 0, window_secs)
  if val ~= nil then
    return val
  end

  val, err = dict:incr(key, 1, 0)
  if val == nil then
    return nil, err
  end
  if val == 1 then
    dict:expire(key, window_secs)
  end
  return val
end

local function ban_ip(ip, ttl)
  local ban = dict_get("xmp_cc_ban")
  if not ban then
    return
  end
  ban:set("ban:" .. ip, 1, ttl)
end

local function is_banned(ip)
  local ban = dict_get("xmp_cc_ban")
  if not ban then
    return false
  end
  return ban:get("ban:" .. ip) ~= nil
end

local function get_verified_id(domain, ip)
  local st = dict_get("xmp_cc_state")
  if not st then
    return nil
  end
  return st:get("ver:" .. domain .. ":" .. ip)
end

local function is_verified(domain, ip)
  local verid = get_verified_id(domain, ip)
  if not verid then
    return false
  end
  local ck = ngx.var["cookie___xmp_cc_verified"]
  return ck ~= nil and ck == verid
end

local function mark_verified(domain, ip, ttl)
  local st = dict_get("xmp_cc_state")
  if not st then
    return
  end
  local verid = b64url(rand_bytes(12))
  st:set("ver:" .. domain .. ":" .. ip, verid, ttl)
  add_set_cookie("__xmp_cc_verified=" .. verid .. "; Max-Age=" .. tostring(ttl) .. "; Path=/; HttpOnly; SameSite=Lax")
end

local function fail_key(domain, ip)
  return "fail:" .. domain .. ":" .. ip
end

local function incr_fail(domain, ip, ttl, max_fail)
  local st = dict_get("xmp_cc_state")
  if not st then
    return 0
  end
  local k = fail_key(domain, ip)
  local n = dict_incr_window(st, k, ttl)
  if n == nil then
    return 0
  end
  if n >= max_fail then
    ban_ip(ip, 300)
    return n
  end
  return n
end

function M.access()
  local cfg = get_site_cfg()
  if not cfg then
    return
  end

  local uri = ngx.var.uri
  if is_bypass_path(uri) then
    return
  end

  local ip = client_ip()
  if ip == "" then
    return ngx.exit(444)
  end
  if is_banned(ip) then
    return ngx.exit(444)
  end

  local ctr = dict_get("xmp_cc_ctr")
  local st = dict_get("xmp_cc_state")
  if not ctr or not st then
    return
  end

  if cfg.ip_x and cfg.ip_x > 0 then
    local b = get_bucket(30)
    local key = "ip:" .. ip .. ":" .. tostring(b)
    local n = dict_incr_window(ctr, key, 30)
    if n ~= nil and n > cfg.ip_x then
      ban_ip(ip, 600)
      return ngx.exit(444)
    end
  end

  if cfg.domain_y and cfg.domain_y > 0 then
    local domain = host_only()
    if domain == "" then
      return ngx.exit(444)
    end

    local hold_key = "hold:" .. domain
    local hold = st:get(hold_key)
    if not hold then
      local b = get_bucket(30)
      local key = "dom:" .. domain .. ":" .. tostring(b)
      local n = dict_incr_window(ctr, key, 30)
      if n ~= nil and n >= cfg.domain_y then
        st:set(hold_key, 1, 600)
        hold = 1
      end
    end

    if hold then
      if is_verified(domain, ip) then
        return
      end
      local u = ngx.var.request_uri or "/"
      return ngx.redirect("/__cc?u=" .. ngx.escape_uri(u), 302)
    end
  end
end

function M.page()
  ngx.header["Content-Type"] = "text/html; charset=utf-8"
  ngx.say('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checking...</title></head><body><script src="/__cc.js"></script></body></html>')
  return ngx.exit(200)
end

function M.js()
  ngx.header["Content-Type"] = "application/javascript; charset=utf-8"
  ngx.say([[
(function(){
  function q(name){try{return new URLSearchParams(location.search).get(name)}catch(_){return null}}
  function go(u){location.href = u || '/'}
  function goDegrade(u){location.href='/__cc/degrade?u='+encodeURIComponent(u||'/')}
  function toHex(buf){return Array.from(new Uint8Array(buf)).map(function(x){return ('0'+x.toString(16)).slice(-2)}).join('')}

  async function sha1hex(s){
    if(!(self.crypto && crypto.subtle && crypto.subtle.digest)) return null
    var enc = new TextEncoder()
    var data = enc.encode(s)
    try{
      var d = await crypto.subtle.digest('SHA-1', data)
      return toHex(d)
    }catch(_){
      return null
    }
  }

  async function pow(token,salt,prefix,u){
    var start = Date.now()
    var budget = 8000
    var nonce = 0
    while(true){
      var hex = await sha1hex(salt+":"+token+":"+nonce)
      if(!hex){goDegrade(u);return}
      if(hex.startsWith(prefix)) break
      nonce++
      if(Date.now()-start > budget) {goDegrade(u);return}
    }
    try{
      var res = await fetch('/__cc/verify', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({token:token, nonce:nonce})
      })
      var j = await res.json().catch(function(){return null})
      if(j && j.ok && j.redirect){go(j.redirect);return}
      location.reload()
    }catch(_){
      goDegrade(u);return
    }
  }

  async function init(){
    var u = q('u') || '/'
    try{
      var res = await fetch('/__cc/init?u='+encodeURIComponent(u), {method:'POST'})
      var j = await res.json().catch(function(){return null})
      if(!j || !j.token || !j.salt || !j.prefix){goDegrade(u);return}
      pow(j.token, j.salt, j.prefix, j.u || u)
    }catch(_){
      goDegrade(u);return
    }
  }

  init()
})();]])
  return ngx.exit(200)
end

function M.init()
  if ngx.req.get_method() ~= "POST" then
    return ngx.exit(444)
  end

  local cfg = get_site_cfg()
  if not cfg then
    return ngx.exit(444)
  end

  local domain = host_only()
  local ip = client_ip()
  if domain == "" or ip == "" then
    return ngx.exit(444)
  end

  local u = normalize_u(ngx.var.arg_u)

  local prefix = cfg.strict == 1 and "00000" or "0000"
  local salt = b64url(rand_bytes(12))
  local token = b64url(rand_bytes(18))

  local st = dict_get("xmp_cc_state")
  if not st then
    return ngx.exit(444)
  end

  local rec = {
    ip = ip,
    domain = domain,
    prefix = prefix,
    salt = salt,
    u = u,
    strict = cfg.strict,
    exp = now_s() + 120,
  }
  st:set("tok:" .. token, cjson.encode(rec), 120)

  add_set_cookie("__xmp_cc_token=" .. token .. "; Max-Age=120; Path=/; HttpOnly; SameSite=Lax")

  return json_out(200, { token = token, prefix = prefix, salt = salt, u = u })
end

function M.verify()
  if ngx.req.get_method() ~= "POST" then
    return ngx.exit(444)
  end

  local cfg = get_site_cfg()
  if not cfg then
    return ngx.exit(444)
  end

  local domain = host_only()
  local ip = client_ip()
  if domain == "" or ip == "" then
    return ngx.exit(444)
  end

  ngx.req.read_body()
  local body = ngx.req.get_body_data() or ""
  local reqj = cjson.decode(body) or {}
  local token = reqj.token
  local nonce = reqj.nonce

  local ck = ngx.var["cookie___xmp_cc_token"]
  if not token or not ck or token ~= ck then
    incr_fail(domain, ip, 600, 5)
    return ngx.exit(444)
  end

  local st = dict_get("xmp_cc_state")
  if not st then
    return ngx.exit(444)
  end

  local rec_s = st:get("tok:" .. token)
  if not rec_s then
    incr_fail(domain, ip, 600, 5)
    return ngx.exit(444)
  end

  local rec = cjson.decode(rec_s) or {}
  if rec.domain ~= domain or rec.ip ~= ip or rec.exp == nil or rec.exp < now_s() then
    st:delete("tok:" .. token)
    incr_fail(domain, ip, 600, 5)
    return ngx.exit(444)
  end

  local salt = rec.salt
  local prefix = rec.prefix
  local nonce_s = tostring(nonce or "")
  if salt == nil or prefix == nil or nonce_s == "" then
    incr_fail(domain, ip, 600, 5)
    return ngx.exit(444)
  end

  local data = salt .. ":" .. token .. ":" .. nonce_s
  local hex = str.to_hex(ngx.sha1_bin(data))
  if not starts_with(hex, prefix) then
    local n = incr_fail(domain, ip, 600, 5)
    if n >= 5 then
      return ngx.exit(444)
    end
    return json_out(200, { ok = false })
  end

  st:delete("tok:" .. token)
  mark_verified(domain, ip, 600)
  return json_out(200, { ok = true, redirect = normalize_u(rec.u) })
end

function M.degrade()
  local cfg = get_site_cfg()
  if not cfg then
    return ngx.exit(444)
  end

  local domain = host_only()
  local ip = client_ip()
  if domain == "" or ip == "" then
    return ngx.exit(444)
  end

  local u = normalize_u(ngx.var.arg_u)

  if cfg.strict == 1 then
    incr_fail(domain, ip, 600, 5)
    return ngx.exit(444)
  end

  add_set_cookie("__xmp_cc_probe=1; Max-Age=120; Path=/; HttpOnly; SameSite=Lax")
  return ngx.redirect("/__cc/recheck?u=" .. ngx.escape_uri(u), 302)
end

function M.recheck()
  local cfg = get_site_cfg()
  if not cfg then
    return ngx.exit(444)
  end

  local domain = host_only()
  local ip = client_ip()
  if domain == "" or ip == "" then
    return ngx.exit(444)
  end

  local u = normalize_u(ngx.var.arg_u)

  local probe = ngx.var["cookie___xmp_cc_probe"]
  if not probe then
    if cfg.strict == 1 then
      incr_fail(domain, ip, 600, 5)
    end
    return ngx.exit(444)
  end

  add_set_cookie("__xmp_cc_probe=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax")
  mark_verified(domain, ip, 600)
  return ngx.redirect(u, 302)
end

return M
