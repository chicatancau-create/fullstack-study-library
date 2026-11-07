#!/usr/bin/env bash
# E13 证据采集：SLO/错误预算、慢响应、进程宕机、重启恢复。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
node scripts/check.mjs > evidence/run.txt 2>&1
rc=$?
echo "exit=$rc" >> evidence/run.txt
exit "$rc"
