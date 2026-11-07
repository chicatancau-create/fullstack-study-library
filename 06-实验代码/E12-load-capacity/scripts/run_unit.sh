#!/usr/bin/env bash
# E12 证据采集：独立服务进程 + 三轮闭环负载。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
node scripts/load.mjs > evidence/run.txt 2>&1
rc=$?
echo "exit=$rc" >> evidence/run.txt
exit "$rc"
