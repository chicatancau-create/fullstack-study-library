#!/usr/bin/env bash
# U03 证据采集：类型检查、单元测试、事件循环示例。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ ! -d node_modules/typescript ]; then
  npm ci --no-audit --no-fund
fi

fails=0
npx tsc --noEmit > evidence/typecheck.txt 2>&1
rc=$?
echo "typecheck exit=$rc"
[ "$rc" -eq 0 ] || fails=$((fails + 1))

node --experimental-strip-types --test tests/*.test.ts > evidence/test.txt 2>&1
rc=$?
echo "test exit=$rc"
[ "$rc" -eq 0 ] || fails=$((fails + 1))

node --experimental-strip-types examples/event-loop.ts > evidence/demo.txt 2>&1
rc=$?
echo "demo exit=$rc"
[ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "typecheck: $(grep -c 'error TS' evidence/typecheck.txt) errors"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "demo: $(tail -1 evidence/demo.txt)"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"