#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
fails=0

node --check web/app.js > evidence/syntax-app.txt 2>&1
rc=$?; echo "syntax-app exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

node --check web/core.mjs > evidence/syntax-core.txt 2>&1
rc=$?; echo "syntax-core exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

node --test tests/core.test.js 2>&1 | tee evidence/test.txt
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "syntax: app=$(tail -1 evidence/syntax-app.txt | tr -d '\r') core=$(tail -1 evidence/syntax-core.txt | tr -d '\r')"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
