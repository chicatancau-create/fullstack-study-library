#!/usr/bin/env bash
# E11 证据采集：语法 + 授权矩阵测试。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ ! -d node_modules/fastify ]; then
  npm ci --no-audit --no-fund
fi

fails=0
node --check src/app.js > evidence/syntax.txt 2>&1
rc=$?; echo "syntax exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

node --test tests/*.test.js > evidence/test.txt 2>&1
rc=$?; echo "test exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "syntax: $(grep -c 'SyntaxError' evidence/syntax.txt) errors"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
