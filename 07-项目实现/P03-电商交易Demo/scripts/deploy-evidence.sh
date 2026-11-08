#!/usr/bin/env bash
# 真实执行 docker compose up 并采集证据；app 未就绪或任一命令失败即非零退出。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
OUT=evidence/deploy.txt
: > "$OUT"

log() { echo "$@" | tee -a "$OUT"; }

if ! command -v docker >/dev/null 2>&1; then
  log "本机无 Docker：未执行 docker compose up（不作为部署通过证据）"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  log "无 docker compose 插件：未执行 up"
  exit 1
fi

log "== docker compose version"
docker compose version 2>&1 | tee -a "$OUT"

log "== docker compose up -d --build"
DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-0}" docker compose up -d --build 2>&1 | tee -a "$OUT"

APP_URL="${APP_URL:-http://127.0.0.1:8796}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
deadline=$((SECONDS + 240))
until curl -fsS "${APP_URL}${HEALTH_PATH}" -o /tmp/p03_probe.json 2>/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    log "ERROR: app 未在 240s 内就绪"
    docker compose ps -a 2>&1 | tee -a "$OUT"
    docker compose logs app 2>&1 | tee -a "$OUT"
    exit 1
  fi
  sleep 3
done

log "== docker compose ps"
docker compose ps 2>&1 | tee -a "$OUT"
log "== GET ${APP_URL}${HEALTH_PATH}"
head -c 400 /tmp/p03_probe.json | tee -a "$OUT"
echo | tee -a "$OUT"
log "== docker compose logs --tail=20 app"
docker compose logs --tail=20 app 2>&1 | tee -a "$OUT"
log "DEPLOY PASS"
