#!/usr/bin/env bash
# U02 证据采集：真实浏览器检查 + axe。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
node scripts/check.mjs > evidence/run.txt 2>&1
rc=$?
echo "exit=$rc" >> evidence/run.txt
exit "$rc"