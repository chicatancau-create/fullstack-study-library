#!/usr/bin/env bash
# E09 证据采集：真实 Redis（默认 6379，DB 15）。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

fails=0
node scripts/env.mjs > evidence/env.txt 2>&1
rc=$?; echo "env exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

node --test tests/*.test.js > evidence/test.txt 2>&1
rc=$?; echo "test exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "redis: $(grep redis_version evidence/env.txt | head -1)"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
