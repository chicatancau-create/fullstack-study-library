#!/usr/bin/env bash
# E10 证据采集：真实 RabbitMQ + PostgreSQL。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ -z "${PGPASSWORD:-}" ]; then
  echo "缺少 PGPASSWORD" >&2
  exit 2
fi

node src/experiment.mjs > evidence/run.txt 2>&1
rc=$?
echo "exit=$rc" >> evidence/run.txt
exit "$rc"
