#!/usr/bin/env bash
# U08 证据采集：真实 HTTP 请求 + 原始 TCP 响应。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
node scripts/check.mjs > evidence/run.txt 2>&1
rc=$?
echo "exit=$rc" >> evidence/run.txt
exit "$rc"