#!/usr/bin/env bash
# 采集 E04 的原始 HTTP 证据。只访问本机 127.0.0.1:8787/8788。
set -uo pipefail
cd "$(dirname "$0")/.."

OUT=evidence
API=http://127.0.0.1:8787
WEB=http://127.0.0.1:8788
mkdir -p "$OUT"
rm -f "$OUT"/*.txt "$OUT"/*.json "$OUT"/*.png

node src/server.mjs > "$OUT/server.log" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 100); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  if grep -q '\[ready\] web' "$OUT/server.log" 2>/dev/null; then ready=1; break; fi
  sleep 0.1
done
if [ "$ready" -ne 1 ]; then
  printf '服务端未就绪（可能端口被占用）。server.log:\n'
  cat "$OUT/server.log"
  exit 1
fi

req() {
  local file="$1"; shift
  {
    printf '$ curl %s\n' "$*"
    curl -sS -i --http1.1 --max-time 10 "$@" 2>&1
    local code=$?
    printf '\nexit=%s\n\n' "$code"
  } >> "$OUT/$file"
}

rm -f "$OUT/status-codes.txt" "$OUT/cache.txt" "$OUT/cookies.txt" "$OUT/cors-curl.txt" "$OUT/cookie-jar.txt"

# --- 状态码：200/201/204/304/400/401/403/404/409/422/500 ---
req status-codes.txt "$API/api/items"
req status-codes.txt -X POST -H 'content-type: application/json' -d '{"title":"new-task"}' "$API/api/items"
req status-codes.txt -X DELETE "$API/api/items/2"
for code in 400 401 403 404 409 422 500; do
  req status-codes.txt "$API/api/error/$code"
done
req status-codes.txt -X POST -H 'content-type: application/json' -d '{not json' "$API/api/items"
req status-codes.txt -X POST -H 'content-type: application/json' -d '{"title":""}' "$API/api/items"

# --- 缓存：Cache-Control / ETag / Vary / 条件请求 304 ---
etag=$(curl -sS -D - -o /dev/null --max-time 10 "$API/api/items" | tr -d '\r' | awk 'tolower($1)=="etag:"{print $2}')
{
  printf '# 从第一次响应提取 ETag: %s\n\n' "${etag:-<empty>}"
} >> "$OUT/cache.txt"
req cache.txt "$API/api/items"
if [ -n "${etag:-}" ]; then
  req cache.txt -H "If-None-Match: $etag" "$API/api/items"
  req cache.txt -H 'If-None-Match: "stale-etag"' "$API/api/items"
fi

# --- Cookie：Set-Cookie / HttpOnly / 会话 ---
login_cmd=(curl -sS -i --http1.1 --max-time 10 -c "$OUT/cookie-jar.txt" -H 'content-type: application/json' -d '{"user":"demo","pass":"demo"}' "$API/api/session")
{
  printf '$ %s\n' "${login_cmd[*]}"
  "${login_cmd[@]}"
  printf '\n\n--- cookie jar（#HttpOnly_ 前缀由 curl 标注）---\n'
  cat "$OUT/cookie-jar.txt"
  printf '\n'
} > "$OUT/cookies.txt"
req cookies.txt "$API/api/session"
req cookies.txt -b "$OUT/cookie-jar.txt" "$API/api/session"
req cookies.txt -X POST -H 'content-type: application/json' -d '{"user":"demo","pass":"wrong"}' "$API/api/session"

# --- 失败分层：未监听端口（本机表现为超时）/ 慢响应 / 断开连接 / 超时后服务端已提交 ---
rm -f "$OUT/failures.txt"
req failures.txt --max-time 2 http://127.0.0.1:8791/
req failures.txt --max-time 1 "$API/api/slow?ms=1500"
req failures.txt --max-time 2 "$API/api/reset"
req failures.txt --max-time 1 -X POST "$API/api/slow-write"
sleep 1.5
req failures.txt "$API/api/items"

# --- CORS：预检、允许、拒绝（无 ACAO）、凭据、* + 凭据 ---
req cors-curl.txt -X OPTIONS \
  -H "Origin: $WEB" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-demo' \
  "$API/api/cors/allow"
req cors-curl.txt -H "Origin: $WEB" "$API/api/cors/allow"
req cors-curl.txt -H 'Origin: http://evil.example' "$API/api/cors/allow"
req cors-curl.txt -H "Origin: $WEB" "$API/api/cors/deny"
req cors-curl.txt -H "Origin: $WEB" "$API/api/cors/credentials"
req cors-curl.txt -H "Origin: $WEB" "$API/api/cors/wildcard"

printf '原始 HTTP 证据已写入 %s/\n' "$OUT"

node scripts/browser_probe.mjs
rc=$?
printf 'browser_probe exit=%s\n' "$rc"
exit "$rc"