#!/usr/bin/env bash
# E12 证据采集：闭环回归 + 开放到达率四档 + CPU profile + 资源饱和 + 测试。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ -z "${PGPASSWORD:-}" ]; then
  echo "缺少 PGPASSWORD（DB 档需要本地合成库）" >&2
  exit 2
fi

if [ ! -d node_modules/pg ]; then
  npm ci --no-audit --no-fund
fi

fails=0
run() {
  local out="$1"; shift
  "$@" > "evidence/$out" 2>&1
  local rc=$?
  echo "$out exit=$rc"
  [ "$rc" -eq 0 ] || fails=$((fails + 1))
}

run run.txt node scripts/load.mjs
run open-load.txt node scripts/open_load.mjs all
run test.txt node --test --test-concurrency=1 tests/load.test.js

{
  echo "captured_at: $(date -Is)"
  echo "closed-loop: $(grep 'LOAD PASS' evidence/run.txt || tail -1 evidence/run.txt)"
  echo "open-loop: $(grep 'OPEN LOAD PASS' evidence/open-load.txt || tail -1 evidence/open-load.txt)"
  echo "tiers: $(grep -E '^(ordinary|peak|over|db):' evidence/open-load.txt | tr '\n' ' ')"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run-summary.txt

exit "$fails"
