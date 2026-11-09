#!/usr/bin/env bash
# E07 证据采集：真实 PostgreSQL 双连接并发。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ -z "${PGPASSWORD:-}" ]; then
  echo "缺少 PGPASSWORD（本地合成库凭据只从环境变量读取）" >&2
  exit 2
fi

fails=0
node scripts/env.mjs > evidence/env.txt 2>&1
rc=$?; echo "env exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

node scripts/txn_evidence.mjs > evidence/txn-run.txt 2>&1
rc=$?; echo "txn exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

node --test --test-concurrency=1 tests/*.test.js > evidence/test.txt 2>&1
rc=$?; echo "test exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "db: $(grep 'PostgreSQL' evidence/env.txt | head -1)"
  echo "txn: $(tail -1 evidence/txn-run.txt)"
  echo "serializable: $(grep '后提交' evidence/serializable.txt 2>/dev/null || true)"
  echo "deadlock: $(grep '错误码' evidence/deadlock.txt 2>/dev/null || true)"
  echo "pool: $(grep '第 3 个获取' evidence/pool.txt 2>/dev/null || true)"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
