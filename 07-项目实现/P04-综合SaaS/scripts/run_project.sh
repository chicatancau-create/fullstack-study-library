#!/usr/bin/env bash
# 项目 04 一键验证：迁移 -> 真实 PostgreSQL 测试 -> 备份恢复。
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST=${PGHOST:-127.0.0.1}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-study}
export PGDATABASE=${PGDATABASE:-study_lab}
if [ -z "${PGPASSWORD:-}" ]; then
  echo "需要 PGPASSWORD（本地合成账号密码），例如：PGPASSWORD=study-pass bash scripts/run_project.sh" >&2
  exit 2
fi

mkdir -p evidence
echo "node $(node -v) pg=$(node -p "require('pg/package.json').version")" | tee evidence/toolchain.txt

node scripts/migrate.mjs | tee evidence/migrate.txt

set +e
node --test tests/*.test.js 2>&1 | tee evidence/test.txt
tests_rc=${PIPESTATUS[0]}
set -e
if [ "$tests_rc" -ne 0 ]; then
  echo "FAIL tests rc=$tests_rc" | tee evidence/run.txt
  exit 1
fi

node scripts/backup.mjs 2>&1 | tee evidence/backup.txt
node scripts/trace_check.mjs 2>&1 | tee evidence/trace.txt
node scripts/jobs_check.mjs 2>&1 | tee evidence/jobs.txt
node scripts/alert_check.mjs 2>&1 | tee evidence/alerts.txt

{
  echo "captured_at: $(date -Is)"
  echo "node: $(node -v)"
  echo "migrate=PASS"
  echo "tests=PASS"
  echo "backup_restore=PASS"
  echo "otel=PASS"
  echo "jobs=PASS"
  echo "alerts=PASS"
  echo "PROJECT04 PASS"
} | tee evidence/run.txt
