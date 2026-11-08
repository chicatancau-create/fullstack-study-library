#!/usr/bin/env bash
# 项目 03 本地 HTTPS 部署演练：自签名证书 + 反向代理 + HSTS。仅本机。
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST=${PGHOST:-127.0.0.1}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-study}
export PGDATABASE=${PGDATABASE:-study_lab}
if [ -z "${PGPASSWORD:-}" ]; then echo "需要 PGPASSWORD" >&2; exit 2; fi
mkdir -p evidence
tls=$(mktemp -d)
cleanup() { kill "${gateway_pid:-}" "${app_pid:-}" 2>/dev/null || true; taskkill //PID "${gateway_pid:-0}" //F >/dev/null 2>&1 || true; taskkill //PID "${app_pid:-0}" //F >/dev/null 2>&1 || true; rm -rf "$tls"; }
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -keyout "$tls/key.pem" -out "$tls/cert.pem" \
  -subj "//CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" >/dev/null 2>&1
PORT=8796 node src/server.js > evidence/https-app.log 2>&1 &
app_pid=$!
TLS_KEY="$tls/key.pem" TLS_CERT="$tls/cert.pem" HTTPS_PORT=9443 APP_URL="http://127.0.0.1:8796" node scripts/https_gateway.mjs > evidence/https-gateway.log 2>&1 &
gateway_pid=$!
for i in $(seq 1 40); do curl -fsS --cacert "$tls/cert.pem" https://127.0.0.1:9443/health >/dev/null 2>&1 && break; sleep 1; done
{
  echo "== https health"
  curl -sS --cacert "$tls/cert.pem" -D - https://127.0.0.1:9443/health
  echo
  echo "== tls version"
  echo | openssl s_client -connect 127.0.0.1:9443 -tls1_2 2>/dev/null | grep -E "Protocol|Cipher" | head -2
  echo "== plain http (expect failure)"
  set +e
  curl -sS --max-time 3 http://127.0.0.1:9443/health 2>&1 | head -1
  echo "plain_http_exit=$?"
  set -e
} | tee evidence/deploy.txt
echo "DEPLOY PASS" | tee -a evidence/deploy.txt
