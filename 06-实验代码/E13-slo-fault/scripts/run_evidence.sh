#!/usr/bin/env bash
# E13 证据采集：蓝绿/金丝雀/故障中止/expand 回滚/SLO 燃烧率 + 测试。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ -z "${PGPASSWORD:-}" ]; then
  echo "缺少 PGPASSWORD（expand/contract 需要本地合成库）" >&2
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

run release.txt node src/release_evidence.mjs all
run test.txt node --test --test-concurrency=1 tests/release.test.js

{
  echo "captured_at: $(date -Is)"
  echo "release: $(grep -E '^RELEASE (PASS|FAIL)' evidence/release.txt || tail -1 evidence/release.txt)"
  echo "stages: $(grep -E '^(BLUEGREEN|CANARY|FAULT|EXPAND|SLO) PASS' evidence/release.txt | tr '\n' ' ')"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run-summary.txt

exit "$fails"
