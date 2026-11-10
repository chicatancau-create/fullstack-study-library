#!/usr/bin/env bash
# G4 数据库题环境准备：把 schema 与迁移演练脚本应用到本机 PostgreSQL 的 study_lab。
# 不建库、不碰业务 schema；只操作 g4_lab / g4_lab_migrate。
set -uo pipefail

PSQL="${PSQL:-D:/PostgreSQL/18/bin/psql.exe}"
HOST="${PGHOST:-127.0.0.1}"
USER="${PGUSER:-study}"
DB="${PGDATABASE:-study_lab}"
export PGPASSWORD="${PGPASSWORD:-study-pass}"

if [ ! -x "$PSQL" ]; then
  echo "SKIP: 找不到 psql（$PSQL）；数据库题未实测。"
  exit 0
fi

cd "$(dirname "$0")/.."
echo "apply db/schema.sql"
"$PSQL" -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f db/schema.sql || exit 1
echo "apply db/migrate_rollback.sql"
"$PSQL" -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f db/migrate_rollback.sql || exit 1

ROWS=$("$PSQL" -h "$HOST" -U "$USER" -d "$DB" -tAc "select count(*) from g4_lab.task")
echo "g4_lab.task rows=$ROWS"
echo "DB-SETUP OK"
