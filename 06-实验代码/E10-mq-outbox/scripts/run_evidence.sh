#!/usr/bin/env bash
# E10 证据采集：真实 RabbitMQ + PostgreSQL；Outbox 主链路 + 崩溃窗口 + 顺序语义 + 测试。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ -z "${PGPASSWORD:-}" ]; then
  echo "缺少 PGPASSWORD" >&2
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

run run.txt node src/experiment.mjs
run crash-windows.txt node src/crash_windows.mjs all
run test.txt node --test --test-concurrency=1 tests/outbox.test.js

{
  echo "captured_at: $(date -Is)"
  echo "reconcile: $(grep 'E10 PASS' evidence/run.txt || tail -1 evidence/run.txt)"
  echo "crash: $(grep -E 'PHANTOM PASS|CRASH PASS|SIDEEFFECT PASS|ORDER PASS' evidence/crash-windows.txt | tr '\n' ' ')"
  echo "gate: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run-summary.txt

exit "$fails"
