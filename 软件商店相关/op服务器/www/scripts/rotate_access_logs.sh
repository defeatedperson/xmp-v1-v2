#!/usr/bin/env sh

set -eu

LOG_ROOT="/www/web_log"
OPENRESTY_BIN="${OPENRESTY_BIN:-openresty}"
HISTORY_KEEP_COUNT=7

today="$(date +"%Y-%m-%d")"

if [ ! -d "$LOG_ROOT" ]; then
  exit 0
fi

for log_file in "$LOG_ROOT"/*.access.log; do
  [ -f "$log_file" ] || continue

  base_name="$(basename "$log_file")"
  domain_name="${base_name%.access.log}"
  domain_dir="$LOG_ROOT/$domain_name"

  if [ ! -d "$domain_dir" ]; then
    mkdir -p "$domain_dir"
  fi

  archived_log="$domain_dir/$today.log"

  mv "$log_file" "$archived_log"
  : >"$log_file"
done

for domain_dir in "$LOG_ROOT"/*; do
  [ -d "$domain_dir" ] || continue

  set +e
  # 按日期倒序，优先保留最新日志
  files=$(ls -1 "$domain_dir"/*.log 2>/dev/null | sort -r)
  status=$?
  set -e

  if [ $status -ne 0 ]; then
    continue
  fi

  # 仅保留最新的 N 份历史日志
  keep=$HISTORY_KEEP_COUNT

  printf '%s\n' "$files" | while IFS= read -r file; do
    if [ $keep -gt 0 ]; then
      keep=$((keep - 1))
      continue
    fi
    rm -f "$file"
  done
done

$OPENRESTY_BIN -s reopen 2>/dev/null || true

exit 0
