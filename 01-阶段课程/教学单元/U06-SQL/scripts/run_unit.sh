#!/usr/bin/env bash
# U06 证据采集：SQLite 约束/事务/索引测试 + 演示。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

fails=0
python -X utf8 -m unittest discover -s tests -v > evidence/test.txt 2>&1
rc=$?
echo "test exit=$rc"
[ "$rc" -eq 0 ] || fails=$((fails + 1))

python -X utf8 examples/demo.py > evidence/demo.txt 2>&1
rc=$?
echo "demo exit=$rc"
[ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "test: $(grep -E '^Ran [0-9]+ test' evidence/test.txt | tail -1) / $(grep -E '^OK|^FAILED' evidence/test.txt | tail -1)"
  echo "demo: $(tail -1 evidence/demo.txt)"
  echo "plan: $(grep '^plan:' evidence/demo.txt)"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"