#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "需要 PGPASSWORD（本地合成账号密码），例如：PGPASSWORD=study-pass bash run.sh" >&2
  exit 2
fi

if [ ! -d node_modules/pg ]; then
  npm install --no-audit --no-fund
fi

mkdir -p evidence
fails=0

node concurrency.mjs 2>&1 | tee evidence/concurrency.txt
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || fails=$((fails + 1))

node outbox.mjs 2>&1 | tee evidence/outbox.txt
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || fails=$((fails + 1))

(cd jvm && node diagnose.mjs) 2>&1 | tee jvm/evidence/diagnose.txt
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "node: $(node -v)"
  echo "pg: $(node -p "require('pg/package.json').version")"
  echo "concurrency: $(tail -1 evidence/concurrency.txt)"
  echo "outbox: $(tail -1 evidence/outbox.txt)"
  echo "jvm: $(tail -1 jvm/evidence/diagnose.txt)"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
