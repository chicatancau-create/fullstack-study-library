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

node --test tests/*.test.js > evidence/test.txt 2>&1
rc=$?; echo "test exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "db: $(grep 'PostgreSQL' evidence/env.txt | head -1)"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
