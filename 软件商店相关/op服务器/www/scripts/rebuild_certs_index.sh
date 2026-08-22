#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
CERTS_DIR="$ROOT_DIR/certs"
CERTS_INDEX="$CERTS_DIR/index.json"
LOCK_DIR="$ROOT_DIR/.acme_issue_lock"
LOCK_TIMEOUT_SECONDS=3600

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

MODE="${1:-rebuild}"

if [ "$MODE" = "rebuild" ]; then
  rebuild_index
  exit 0
fi

if [ "$MODE" = "import_auto" ]; then
  CERT_NAME="${2:-}"
  EMAIL="${3:-}"
  FULLCHAIN_SRC="${4:-}"
  PRIVKEY_SRC="${5:-}"
  REMARK="${6:-}"

  if [ -z "$CERT_NAME" ] || [ -z "$EMAIL" ] || [ -z "$FULLCHAIN_SRC" ] || [ -z "$PRIVKEY_SRC" ]; then
    echo "usage: $0 import_auto <cert_name> <email> <fullchain_src> <privkey_src> [remark]" >&2
    exit 1
  fi

  CERT_DIR="$CERTS_DIR/$CERT_NAME"
  META_JSON="$CERT_DIR/meta.json"

  mkdir -p "$CERT_DIR"

  cp "$FULLCHAIN_SRC" "$CERT_DIR/fullchain.pem"
  cp "$PRIVKEY_SRC" "$CERT_DIR/privkey.pem"

  san_dns="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -ext subjectAltName 2>/dev/null | grep -o 'DNS:[^,]*' || true)"
  DOMAINS=""
  for entry in $san_dns; do
    d="${entry#DNS:}"
    d="$(printf '%s' "$d" | sed 's/^ *//;s/ *$//')"
    [ -z "$d" ] && continue
    if [ -n "$DOMAINS" ]; then
      DOMAINS="$DOMAINS, "
    fi
    DOMAINS="$DOMAINS$d"
  done

  if [ -z "$DOMAINS" ]; then
    cn="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject 2>/dev/null | sed -n 's/.*CN=\([^,\/]*\).*/\1/p' || true)"
    cn="$(printf '%s' "$cn" | sed 's/^ *//;s/ *$//')"
    if [ -n "$cn" ]; then
      DOMAINS="$cn"
    fi
  fi

  if [ -z "$DOMAINS" ]; then
    echo "failed to parse domains from certificate" >&2
    exit 1
  fi

  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  not_before_cert="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -startdate 2>/dev/null | cut -d= -f2 || echo "")"
  not_after_cert="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")"

  escaped_name="${CERT_NAME//\"/\\\"}"
  escaped_domains="${DOMAINS//\"/\\\"}"
  escaped_email="${EMAIL//\"/\\\"}"
  escaped_remark="${REMARK//\"/\\\"}"

  cat >"$META_JSON" <<EOF
{
  "name": "$escaped_name",
  "domains_csv": "$escaped_domains",
  "email": "$escaped_email",
  "remark": "$escaped_remark",
  "auto_renew": false,
  "status": "issue_success",
  "status_updated_at": "$now",
  "last_error": "",
  "last_renew_attempt_at": "",
  "last_renew_success_at": "",
  "failure_count": 0,
  "not_before": "$not_before_cert",
  "not_after": "$not_after_cert",
  "source": "other"
}
EOF

  rebuild_index

  case "$FULLCHAIN_SRC" in
    "$CERTS_DIR/.upload_tmp/"*)
      rm -f "$FULLCHAIN_SRC" "$PRIVKEY_SRC" 2>/dev/null || true
      ;;
  esac

  exit 0
fi

if [ "$MODE" != "import" ]; then
  echo "usage: $0 [rebuild] | import <cert_name> <domains_csv> <email> <fullchain_src> <privkey_src> [remark] | import_auto <cert_name> <email> <fullchain_src> <privkey_src> [remark]" >&2
  exit 1
fi

CERT_NAME="${2:-}"
DOMAINS="${3:-}"
EMAIL="${4:-}"
FULLCHAIN_SRC="${5:-}"
PRIVKEY_SRC="${6:-}"
REMARK="${7:-}"

if [ -z "$CERT_NAME" ] || [ -z "$DOMAINS" ] || [ -z "$EMAIL" ] || [ -z "$FULLCHAIN_SRC" ] || [ -z "$PRIVKEY_SRC" ]; then
  echo "usage: $0 import <cert_name> <domains_csv> <email> <fullchain_src> <privkey_src> [remark]" >&2
  exit 1
fi

CERT_DIR="$CERTS_DIR/$CERT_NAME"
META_JSON="$CERT_DIR/meta.json"

mkdir -p "$CERT_DIR"

cp "$FULLCHAIN_SRC" "$CERT_DIR/fullchain.pem"
cp "$PRIVKEY_SRC" "$CERT_DIR/privkey.pem"

now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

not_before_cert="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -startdate 2>/dev/null | cut -d= -f2 || echo "")"
not_after_cert="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")"

escaped_name="${CERT_NAME//\"/\\\"}"
escaped_domains="${DOMAINS//\"/\\\"}"
escaped_email="${EMAIL//\"/\\\"}"
escaped_remark="${REMARK//\"/\\\"}"

cat >"$META_JSON" <<EOF
{
  "name": "$escaped_name",
  "domains_csv": "$escaped_domains",
  "email": "$escaped_email",
  "remark": "$escaped_remark",
  "auto_renew": false,
  "status": "issue_success",
  "status_updated_at": "$now",
  "last_error": "",
  "last_renew_attempt_at": "",
  "last_renew_success_at": "",
  "failure_count": 0,
  "not_before": "$not_before_cert",
  "not_after": "$not_after_cert",
  "source": "other"
}
EOF

rebuild_index

exit 0
