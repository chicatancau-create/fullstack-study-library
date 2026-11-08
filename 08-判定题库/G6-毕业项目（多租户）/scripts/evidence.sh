#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
node 教师包/隐藏测试/grade.mjs 教师包/答案密钥/index.mjs | tee evidence/judge-solution.txt
set +e
node 教师包/隐藏测试/grade.mjs 学生包/起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
set -e
if [ "$rc" -eq 0 ]; then
  echo "起始代码不应通过隐藏测试" >&2
  exit 1
fi
echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt
echo "JUDGE PACK PASS"
