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

node explain.mjs 2>&1 | tee evidence/explain.txt
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || fails=$((fails + 1))

node migration.mjs 2>&1 | tee evidence/migration.txt
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "node: $(node -v)"
  echo "pg: $(node -p "require('pg/package.json').version")"
  echo "concurrency: $(tail -1 evidence/concurrency.txt)"
  echo "explain: $(tail -1 evidence/explain.txt)"
  echo "migration: $(tail -1 evidence/migration.txt)"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
