#!/usr/bin/env bash
# 启动本地静态服务并运行 G1 站点取证。只访问 127.0.0.1:8789。
set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules/axe-core ]; then
  npm install --no-audit --no-fund
fi

node scripts/serve.mjs > evidence/server.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 100); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  if grep -q '\[ready\]' evidence/server.log 2>/dev/null; then ready=1; break; fi
  sleep 0.1
done
if [ "$ready" -ne 1 ]; then
  printf '静态服务未就绪（可能端口被占用）。server.log:\n'
  cat evidence/server.log
  exit 1
fi

node scripts/audit.mjs
rc=$?
printf 'audit exit=%s\n' "$rc"
exit "$rc"