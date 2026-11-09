#!/usr/bin/env bash
# E09 证据采集：Redis 8 三实例 Redlock + fencing/idempotency + Cache Aside 回归。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ -z "${PGPASSWORD:-}" ]; then
  echo "缺少 PGPASSWORD（本地合成库凭据只从环境变量读取）" >&2
  exit 2
fi

fails=0
run() {
  local out="$1"; shift
  "$@" > "evidence/$out" 2>&1
  local rc=$?
  echo "$out exit=$rc"
  [ "$rc" -eq 0 ] || fails=$((fails + 1))
}

run env.txt node scripts/env.mjs
run redlock.txt node src/redlock_evidence.mjs
run test.txt node --test --test-concurrency=1 tests/cache.test.js tests/redlock.test.js

{
  echo "captured_at: $(date -Is)"
  echo "cache-redis: $(grep redis_version evidence/env.txt | head -1)"
  echo "redlock-redis: $(grep '^redis:' evidence/redlock.txt | head -1)"
  echo "instances: $(grep '^instances:' evidence/redlock.txt | head -1)"
  echo "redlock: $(grep 'REDLOCK PASS' evidence/redlock.txt || tail -1 evidence/redlock.txt)"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
