#!/usr/bin/env bash
# U07 证据采集：Git Bash 可验证部分。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
bash scripts/check.sh > evidence/run.txt 2>&1
rc=$?
echo "exit=$rc" >> evidence/run.txt
exit "$rc"