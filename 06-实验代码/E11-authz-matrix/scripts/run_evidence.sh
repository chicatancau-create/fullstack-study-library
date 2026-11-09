#!/usr/bin/env bash
# E11 证据采集：语法 + 授权矩阵 + OWASP 靶场（SQLi/XSS/CSRF/SSRF）+ 真实 Edge DOM XSS。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ -z "${PGPASSWORD:-}" ]; then
  echo "缺少 PGPASSWORD（本地合成库凭据只从环境变量读取）" >&2
  exit 2
fi

if [ ! -d node_modules/fastify ] || [ ! -d node_modules/pg ]; then
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

run syntax.txt node --check src/app.js
run syntax-lab.txt node --check src/security_lab.mjs
run security.txt node src/attack_evidence.mjs
run test.txt node --test --test-concurrency=1 tests/app.test.js tests/security.test.js

{
  echo "captured_at: $(date -Is)"
  echo "syntax: $(grep -c 'SyntaxError' evidence/syntax.txt evidence/syntax-lab.txt | tr '\n' ' ')"
  echo "security: $(grep -E '^E11 (PASS|FAIL)' evidence/security.txt || tail -1 evidence/security.txt)"
  echo "zap: $(grep '^ZAP:' evidence/security.txt || echo 'not run')"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
