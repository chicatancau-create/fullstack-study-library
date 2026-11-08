#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repo=$(pwd)
export PGHOST=${PGHOST:-127.0.0.1}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-study}
export PGDATABASE=${PGDATABASE:-study_lab}
if [ -z "${PGPASSWORD:-}" ]; then echo "需要 PGPASSWORD" >&2; exit 2; fi
current=$(git -C /e/fullstack-code rev-parse --short HEAD)
previous=$(git -C /e/fullstack-code rev-parse --short HEAD~1)
tmp=$(mktemp -d)
cleanup() { kill "${app_pid:-}" 2>/dev/null || true; taskkill //PID "${app_pid:-0}" //F >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
git -C /e/fullstack-code archive "$previous" project03-trade | tar -x -C "$tmp"
cd "$tmp/project03-trade"
npm ci --no-audit --no-fund >/dev/null 2>&1
PORT=8796 node src/server.js > rollback-app.log 2>&1 &
app_pid=$!
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:8796/health >/dev/null 2>&1 && break; sleep 1; done
{ echo "current=$current previous=$previous"; echo "rollback_health=$(curl -sS http://127.0.0.1:8796/health)"; echo "ROLLBACK PASS"; } | tee "$repo/evidence/rollback.txt"
