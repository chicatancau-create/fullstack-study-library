#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
node 自测脚本/grade.mjs 参考答案/index.mjs | tee evidence/judge-solution.txt
set +e
node 自测脚本/grade.mjs 起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
set -e
if [ "$rc" -eq 0 ]; then
  echo "起始代码不应通过自测脚本" >&2
  exit 1
fi
echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt
echo "SELF-TEST PASS"
