#!/usr/bin/env bash
# G8 遗留库环境准备：只操作 schema g8_lab（含修复迁移）。
set -uo pipefail

PSQL="${PSQL:-D:/PostgreSQL/18/bin/psql.exe}"
HOST="${PGHOST:-127.0.0.1}"
USER="${PGUSER:-study}"
DB="${PGDATABASE:-study_lab}"
export PGPASSWORD="${PGPASSWORD:-study-pass}"

if [ ! -x "$PSQL" ]; then
  echo "SKIP: 找不到 psql（$PSQL）；遗留系统题未实测。"
  exit 0
fi

cd "$(dirname "$0")/.."
echo "apply db/schema.sql（含故意遗留的缺陷结构）"
"$PSQL" -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f db/schema.sql || exit 1
echo "apply db/migrate_fix.sql（修复所需迁移）"
"$PSQL" -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f db/migrate_fix.sql || exit 1

N=$("$PSQL" -h "$HOST" -U "$USER" -d "$DB" -tAc "select count(*) from g8_lab.task")
COL=$("$PSQL" -h "$HOST" -U "$USER" -d "$DB" -tAc "select count(*) from information_schema.columns where table_schema='g8_lab' and table_name='task' and column_name='version'")
echo "g8_lab.task rows=$N version_column=$COL"
echo "DB-SETUP OK"
