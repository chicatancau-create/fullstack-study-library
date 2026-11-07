#!/usr/bin/env bash
# U01 证据采集：运行示例并把退出码写入证据。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
bash examples/demo.sh > evidence/run.txt 2>&1
rc=$?
echo "exit=$rc" >> evidence/run.txt
exit "$rc"