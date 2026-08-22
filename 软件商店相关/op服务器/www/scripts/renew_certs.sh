#!/usr/bin/env sh
# 自动续签 SSL 证书脚本：
# - 每次执行只处理一张需要续签的证书
# - 通过 meta.json 中的 auto_renew 与 last_renew_attempt_at 控制每日只尝试一次
# - 使用与首次签发脚本相同的全局锁，避免并发冲突
# - 根据续签结果更新每个证书的 meta.json 和全局 index.json
set -eu

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
CERTS_DIR="$ROOT_DIR/certs"
CERTS_INDEX="$CERTS_DIR/index.json"

LOCK_DIR="$ROOT_DIR/.acme_issue_lock"
LOCK_TIMEOUT_SECONDS=3600
ACME_BIN="acme.sh"
OPENRESTY_BIN="${OPENRESTY_BIN:-openresty}"
ACME_HOME="$ROOT_DIR/acme-data"

# 重建 /certs/index.json，聚合所有证书的概要信息供前端展示
rebuild_index() {
  tmp="$(mktemp -t certs_index.XXXXXX)"
  printf '%s\n' '{' >"$tmp"
  printf '%s\n' '  "certs": [' >>"$tmp"
  first=1
  for meta in "$CERTS_DIR"/*/meta.json; do
    [ -f "$meta" ] || continue
    name=$(grep '"name"' "$meta" | head -n1 | sed -E 's/.*"name":[[:space:]]*"([^"]*)".*/\1/')
    domains_csv=$(grep '"domains_csv"' "$meta" | head -n1 | sed -E 's/.*"domains_csv":[[:space:]]*"([^"]*)".*/\1/')
    email=$(grep '"email"' "$meta" | head -n1 | sed -E 's/.*"email":[[:space:]]*"([^"]*)".*/\1/')
    source=$(grep '"source"' "$meta" | head -n1 | sed -E 's/.*"source":[[:space:]]*"([^"]*)".*/\1/' || true)
    if [ -z "$source" ]; then
      source="other"
    fi
    remark=$(grep '"remark"' "$meta" | head -n1 | sed -E 's/.*"remark":[[:space:]]*"([^"]*)".*/\1/')
    status=$(grep '"status"' "$meta" | head -n1 | sed -E 's/.*"status":[[:space:]]*"([^"]*)".*/\1/')
    created_at=$(grep '"status_updated_at"' "$meta" | head -n1 | sed -E 's/.*"status_updated_at":[[:space:]]*"([^"]*)".*/\1/')
    json_domains=""
    OLD_IFS_LOCAL="$IFS"
    IFS=','
    for d in $domains_csv; do
      d_trim=$(printf '%s' "$d" | sed 's/^ *//;s/ *$//')
      [ -z "$d_trim" ] && continue
      if [ -n "$json_domains" ]; then
        json_domains="$json_domains, "
      fi
      json_domains="$json_domains\"$d_trim\""
    done
    IFS="$OLD_IFS_LOCAL"
    if [ $first -eq 0 ]; then
      printf '%s\n' '    ,' >>"$tmp"
    fi
    first=0
    printf '%s\n' '    {' >>"$tmp"
    printf '      "name": "%s",\n' "$name" >>"$tmp"
    printf '      "domains": [ %s ],\n' "$json_domains" >>"$tmp"
    printf '      "email": "%s",\n' "$email" >>"$tmp"
    printf '      "created_at": "%s",\n' "$created_at" >>"$tmp"
    printf '      "remark": "%s",\n' "$remark" >>"$tmp"
    printf '      "status": "%s",\n' "$status" >>"$tmp"
    printf '      "source": "%s"\n' "$source" >>"$tmp"
    printf '%s\n' '    }' >>"$tmp"
  done
  printf '%s\n' '  ]' >>"$tmp"
  printf '%s\n' '}' >>"$tmp"
  mv "$tmp" "$CERTS_INDEX"
  chmod 644 "$CERTS_INDEX" 2>/dev/null || true
}

if [ -d "$LOCK_DIR" ]; then
  now_epoch="$(date -u +"%s")"
  lock_created=0
  if [ -f "$LOCK_DIR/created_at" ]; then
    lock_created="$(cat "$LOCK_DIR/created_at" 2>/dev/null || echo 0)"
  fi
  age=$((now_epoch - lock_created))
  if [ "$age" -gt "$LOCK_TIMEOUT_SECONDS" ] 2>/dev/null; then
    if [ -f "$LOCK_DIR/pid" ]; then
      old_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")"
      if [ -n "$old_pid" ]; then
        kill "$old_pid" 2>/dev/null || true
        sleep 2
        kill -9 "$old_pid" 2>/dev/null || true
      fi
    fi
    rm -rf "$LOCK_DIR" 2>/dev/null || true
  fi
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi

echo "$$" >"$LOCK_DIR/pid"
date -u +"%s" >"$LOCK_DIR/created_at"

cleanup_lock() {
  rm -rf "$LOCK_DIR" 2>/dev/null || true
}

trap cleanup_lock EXIT INT TERM

today="$(date -u +"%Y-%m-%d")"

for meta in "$CERTS_DIR"/*/meta.json; do
  [ -f "$meta" ] || continue

  source=$(grep '"source"' "$meta" | head -n1 | sed -E 's/.*"source":[[:space:]]*"([^"]*)".*/\1/' || true)
  if [ "$source" != "acme" ]; then
    continue
  fi

  auto_renew=$(grep '"auto_renew"' "$meta" | head -n1 | sed -E 's/.*"auto_renew":[[:space:]]*([^, ]*).*/\1/')
  if [ "$auto_renew" != "true" ]; then
    continue
  fi

  name=$(grep '"name"' "$meta" | head -n1 | sed -E 's/.*"name":[[:space:]]*"([^"]*)".*/\1/')
  domains_csv=$(grep '"domains_csv"' "$meta" | head -n1 | sed -E 's/.*"domains_csv":[[:space:]]*"([^"]*)".*/\1/')
  email=$(grep '"email"' "$meta" | head -n1 | sed -E 's/.*"email":[[:space:]]*"([^"]*)".*/\1/')
  remark=$(grep '"remark"' "$meta" | head -n1 | sed -E 's/.*"remark":[[:space:]]*"([^"]*)".*/\1/')

  not_after=$(grep '"not_after"' "$meta" | head -n1 | sed -E 's/.*"not_after":[[:space:]]*"([^"]*)".*/\1/' || true)
  if [ -n "$not_after" ]; then
    now_epoch="$(date -u +"%s")"
    na_epoch="$(date -d "$not_after" +%s 2>/dev/null || echo "")"
    if [ -n "$na_epoch" ]; then
      diff_seconds=$((na_epoch - now_epoch))
      days_left=$((diff_seconds / 86400))
      if [ "$days_left" -gt 30 ] 2>/dev/null; then
        continue
      fi
    fi
  fi

  last_attempt=$(grep '"last_renew_attempt_at"' "$meta" | head -n1 | sed -E 's/.*"last_renew_attempt_at":[[:space:]]*"([^"]*)".*/\1/' || true)
  if [ -n "$last_attempt" ]; then
    last_date="${last_attempt%%T*}"
    if [ "$last_date" = "$today" ]; then
      continue
    fi
  fi

  IFS=',' read -r first_domain _ <<EOF
$domains_csv
EOF

  if [ -z "$first_domain" ]; then
    continue
  fi

  failure_count=$(grep '"failure_count"' "$meta" | head -n1 | sed -E 's/.*"failure_count":[[:space:]]*([0-9]+).*/\1/' || true)
  if [ -z "$failure_count" ]; then
    failure_count=0
  fi

  last_success=$(grep '"last_renew_success_at"' "$meta" | head -n1 | sed -E 's/.*"last_renew_success_at":[[:space:]]*"([^"]*)".*/\1/' || true)
  not_before=$(grep '"not_before"' "$meta" | head -n1 | sed -E 's/.*"not_before":[[:space:]]*"([^"]*)".*/\1/' || true)

  now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  log_file="$(mktemp -t acme_renew.XXXXXX)"

if ! $ACME_BIN --home "$ACME_HOME" --renew -d "$first_domain" >"$log_file" 2>&1; then
    json_escape() {
      sed ':a;N;$!ba;s/\\/\\\\/g;s/\"/\\\"/g;s/\r//g;s/\n/\\n/g'
    }
    error_msg="$(tail -n 50 "$log_file")"
    if printf '%s\n' "$error_msg" | grep -q 'Next renewal time is'; then
      rm -f "$log_file"
      now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      escaped_name="${name//\"/\\\"}"
      escaped_domains="${domains_csv//\"/\\\"}"
      escaped_email="${email//\"/\\\"}"
      escaped_remark="${remark//\"/\\\"}"
      cat >"$meta" <<EOF
{
  "name": "$escaped_name",
  "domains_csv": "$escaped_domains",
  "email": "$escaped_email",
  "remark": "$escaped_remark",
  "auto_renew": $auto_renew,
  "status": "renew_success",
  "status_updated_at": "$now_iso",
  "last_error": "",
  "last_renew_attempt_at": "$now_iso",
  "last_renew_success_at": "$last_success",
  "failure_count": $failure_count,
  "not_before": "$not_before",
  "not_after": "$not_after",
  "source": "acme"
}
EOF
      rebuild_index
      exit 0
    fi
    error_json="$(printf '%s' "$error_msg" | json_escape)"
    rm -f "$log_file"
    failure_count=$((failure_count + 1))
    now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    escaped_name="${name//\"/\\\"}"
    escaped_domains="$(printf '%s' "$domains_csv" | json_escape)"
    escaped_email="$(printf '%s' "$email" | json_escape)"
    escaped_remark="$(printf '%s' "$remark" | json_escape)"

    cat >"$meta" <<EOF
{
  "name": "$escaped_name",
  "domains_csv": "$escaped_domains",
  "email": "$escaped_email",
  "remark": "$escaped_remark",
  "auto_renew": $auto_renew,
  "status": "renew_failed",
  "status_updated_at": "$now_iso",
  "last_error": "$error_json",
  "last_renew_attempt_at": "$now_iso",
  "last_renew_success_at": "$last_success",
  "failure_count": $failure_count,
  "not_before": "$not_before",
  "not_after": "$not_after",
  "source": "acme"
}
EOF

    rebuild_index
    exit 0
  fi

  rm -f "$log_file"

  acme_home="$ACME_HOME"
  src_dir="$acme_home/$first_domain"

  if [ ! -d "$src_dir" ]; then
    if [ -d "${src_dir}_ecc" ]; then
      src_dir="${src_dir}_ecc"
    elif [ -d "${src_dir}_rsa" ]; then
      src_dir="${src_dir}_rsa"
    fi
  fi

  fullchain_src="$src_dir/fullchain.cer"
  privkey_src="$src_dir/$first_domain.key"

  cert_dir="$(dirname "$meta")"

  cp "$fullchain_src" "$cert_dir/fullchain.pem"
  cp "$privkey_src" "$cert_dir/privkey.pem"

  now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  last_success="$now_iso"
  failure_count=0

  not_before_cert="$(openssl x509 -in "$cert_dir/fullchain.pem" -noout -startdate 2>/dev/null | cut -d= -f2 || echo "")"
  not_after_cert="$(openssl x509 -in "$cert_dir/fullchain.pem" -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")"

  escaped_name="${name//\"/\\\"}"
  escaped_domains="${domains_csv//\"/\\\"}"
  escaped_email="${email//\"/\\\"}"
  escaped_remark="${remark//\"/\\\"}"

  cat >"$meta" <<EOF
{
  "name": "$escaped_name",
  "domains_csv": "$escaped_domains",
  "email": "$escaped_email",
  "remark": "$escaped_remark",
  "auto_renew": $auto_renew,
  "status": "renew_success",
  "status_updated_at": "$now_iso",
  "last_error": "",
  "last_renew_attempt_at": "$now_iso",
  "last_renew_success_at": "$last_success",
  "failure_count": $failure_count,
  "not_before": "$not_before_cert",
  "not_after": "$not_after_cert",
  "source": "acme"
}
EOF

  rebuild_index

  $OPENRESTY_BIN -s reload 2>/dev/null || true
  exit 0
done

exit 0
