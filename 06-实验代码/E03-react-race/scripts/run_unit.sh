#!/usr/bin/env bash
# E03 证据采集：类型检查、竞态/乐观/卸载测试、生产构建。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ ! -d node_modules/vite ]; then
  npm ci --no-audit --no-fund
fi

fails=0
NO_COLOR=1 npx tsc --noEmit > evidence/typecheck.txt 2>&1
rc=$?
echo "typecheck exit=$rc"
[ "$rc" -eq 0 ] || fails=$((fails + 1))

NO_COLOR=1 npx vitest run > evidence/test.txt 2>&1
rc=$?
echo "test exit=$rc"
[ "$rc" -eq 0 ] || fails=$((fails + 1))

NO_COLOR=1 npx vite build > evidence/build.txt 2>&1
rc=$?
echo "build exit=$rc"
[ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "typecheck: $(grep -c 'error TS' evidence/typecheck.txt) errors"
  echo "test: $(grep -E 'Tests|Test Files' evidence/test.txt | tr '\n' ' ')"
  echo "build: $(grep -E 'built in|modules transformed' evidence/build.txt | tail -1)"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"