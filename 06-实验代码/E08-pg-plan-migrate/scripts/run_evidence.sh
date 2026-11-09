#!/usr/bin/env bash
# E08 证据采集：执行计划、迁移、expand/contract、兼容矩阵、改类型、回滚与 Prisma 演练。
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
run setup.txt node src/setup.mjs
run explain.txt node src/explain.mjs
run migrate.txt node src/migrate.mjs
run backup.txt node src/backup.mjs
run stages.txt node src/stages.mjs
run compat.txt node src/compat.mjs
run type-change.txt node src/type_change.mjs
run rollback.txt node src/rollback.mjs
run prisma.txt node src/prisma_drill.mjs
run test.txt node --test --test-concurrency=1 tests/migrate.test.js

{
  echo "captured_at: $(date -Is)"
  echo "db: $(grep 'PostgreSQL' evidence/env.txt | head -1)"
  echo "setup: $(grep 'setup rows' evidence/setup.txt | tail -1)"
  echo "plan: $(grep 'before:' evidence/explain.txt | tail -1) / $(grep 'after:' evidence/explain.txt | tail -1)"
  echo "migrate: $(grep 'MIGRATE PASS' evidence/migrate.txt || tail -1 evidence/migrate.txt)"
  echo "restore: $(grep 'RESTORE PASS' evidence/backup.txt || tail -1 evidence/backup.txt)"
  echo "stages: $(grep 'STAGES PASS' evidence/stages.txt || tail -1 evidence/stages.txt)"
  echo "compat: $(grep 'COMPAT PASS' evidence/compat.txt || tail -1 evidence/compat.txt) / $(grep 'matrix cells' evidence/compat.txt)"
  echo "type: $(grep 'TYPE PASS' evidence/type-change.txt || tail -1 evidence/type-change.txt)"
  echo "rollback: $(grep 'ROLLBACK PASS' evidence/rollback.txt || tail -1 evidence/rollback.txt)"
  echo "prisma: $(grep 'PRISMA PASS' evidence/prisma.txt || tail -1 evidence/prisma.txt)"
  echo "test: $(grep -E '^ℹ (tests|pass|fail) ' evidence/test.txt | tr '\n' ' ')"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
