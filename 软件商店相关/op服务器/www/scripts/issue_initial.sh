#!/usr/bin/env sh
# 首次申请 SSL 证书脚本：
# - 使用 acme.sh 通过 HTTP-01 完成首次签发
# - 写入 /certs/<证书名>/ 下的证书文件和 meta.json
# - 维护全局锁，避免与续签流程并发
# - 每次执行后重建 certs/index.json 供管理工具展示
set -eu

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
CERTS_DIR="$ROOT_DIR/certs"
CERTS_INDEX="$CERTS_DIR/index.json"

CERT_NAME="${1:-}"
DOMAINS="${2:-}"
EMAIL="${3:-}"
AUTO_RENEW="${4:-true}"
REMARK="${5:-}"

if [ -z "$CERT_NAME" ] || [ -z "$DOMAINS" ] || [ -z "$EMAIL" ]; then
  echo "usage: $0 <cert_name> <domains_csv> <email> [auto_renew] [remark]" >&2
  exit 1
fi

CERT_DIR="$CERTS_DIR/$CERT_NAME"
META_JSON="$CERT_DIR/meta.json"
LOCK_DIR="$ROOT_DIR/.acme_issue_lock"
LOCK_TIMEOUT_SECONDS=3600
WEBROOT="/acme-challenges"
ACME_BIN="acme.sh"
ACME_HOME="$ROOT_DIR/acme-data"

mkdir -p "$CERT_DIR"

# 重建 /certs/index.json，基于所有 meta.json 聚合列表数据
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
  else
    echo "another certificate task is running, please try again later" >&2
    exit 1
  fi
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "another certificate task is running, please try again later" >&2
  exit 1
fi

echo "$$" >"$LOCK_DIR/pid"
date -u +"%s" >"$LOCK_DIR/created_at"

cleanup_lock() {
  rm -rf "$LOCK_DIR" 2>/dev/null || true
}

trap cleanup_lock EXIT INT TERM

now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

json_escape() {
  sed ':a;N;$!ba;s/\\/\\\\/g;s/\"/\\\"/g;s/\r//g;s/\n/\\n/g'
}
escaped_remark="$(printf '%s' "$REMARK" | json_escape)"
escaped_email="$(printf '%s' "$EMAIL" | json_escape)"
escaped_name="$(printf '%s' "$CERT_NAME" | json_escape)"
escaped_domains="$(printf '%s' "$DOMAINS" | json_escape)"

IFS=',' read -r first_domain _ <<EOF
$DOMAINS
EOF

if [ -z "$first_domain" ]; then
  cat >"$META_JSON" <<EOF
{
  "name": "$escaped_name",
  "domains_csv": "$escaped_domains",
  "email": "$escaped_email",
  "remark": "$escaped_remark",
  "auto_renew": $AUTO_RENEW,
  "status": "issue_failed",
  "status_updated_at": "$now",
  "last_error": "invalid domains input",
  "last_renew_attempt_at": "",
  "last_renew_success_at": "",
  "failure_count": 0,
  "source": "acme"
}
EOF
  rebuild_index
  exit 1
fi

acme_args=""
OLD_IFS="$IFS"
IFS=','
for d in $DOMAINS; do
  acme_args="$acme_args -d $d"
done
IFS="$OLD_IFS"

log_file="$(mktemp -t acme_issue.XXXXXX)"

if ! $ACME_BIN --home "$ACME_HOME" --issue --webroot "$WEBROOT" $acme_args --accountemail "$EMAIL" >"$log_file" 2>&1; then
  error_msg="$(tail -n 20 "$log_file")"
  error_json="$(printf '%s' "$error_msg" | json_escape)"
  rm -f "$log_file"
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  cat >"$META_JSON" <<EOF
{
  "name": "$escaped_name",
  "domains_csv": "$escaped_domains",
  "email": "$escaped_email",
  "remark": "$escaped_remark",
  "auto_renew": $AUTO_RENEW,
  "status": "issue_failed",
  "status_updated_at": "$now",
  "last_error": "$error_json",
  "last_renew_attempt_at": "",
  "last_renew_success_at": "",
  "failure_count": 0,
  "source": "acme"
}
EOF
  rebuild_index
  exit 1
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

cp "$fullchain_src" "$CERT_DIR/fullchain.pem"
cp "$privkey_src" "$CERT_DIR/privkey.pem"

now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

not_before_cert="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -startdate 2>/dev/null | cut -d= -f2 || echo "")"
not_after_cert="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")"

cat >"$META_JSON" <<EOF
{
  "name": "$escaped_name",
  "domains_csv": "$escaped_domains",
  "email": "$escaped_email",
  "remark": "$escaped_remark",
  "auto_renew": $AUTO_RENEW,
  "status": "issue_success",
  "status_updated_at": "$now",
  "last_error": "",
  "last_renew_attempt_at": "",
  "last_renew_success_at": "",
  "failure_count": 0,
  "not_before": "$not_before_cert",
  "not_after": "$not_after_cert",
  "source": "acme"
}
EOF

rebuild_index

exit 0
