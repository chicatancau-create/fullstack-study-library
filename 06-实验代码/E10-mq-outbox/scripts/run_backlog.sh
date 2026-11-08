#!/usr/bin/env bash
# E10：1000 条积压与重放证据（真实 RabbitMQ + PostgreSQL）。
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${PGPASSWORD:-}" ]; then
  echo "缺少 PGPASSWORD" >&2
  exit 2
fi
node src/backlog_replay.mjs
