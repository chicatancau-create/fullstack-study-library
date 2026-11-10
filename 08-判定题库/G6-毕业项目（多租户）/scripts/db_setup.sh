#!/usr/bin/env bash
# G6 多租户环境准备：只操作 schema g6_lab。
set -uo pipefail

PSQL="${PSQL:-D:/PostgreSQL/18/bin/psql.exe}"
HOST="${PGHOST:-127.0.0.1}"
USER="${PGUSER:-study}"
DB="${PGDATABASE:-study_lab}"
export PGPASSWORD="${PGPASSWORD:-study-pass}"

if [ ! -x "$PSQL" ]; then
  echo "SKIP: 找不到 psql（$PSQL）；多租户题未实测。"
  exit 0
fi

cd "$(dirname "$0")/.."
echo "apply db/schema.sql"
"$PSQL" -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f db/schema.sql || exit 1

N=$("$PSQL" -h "$HOST" -U "$USER" -d "$DB" -tAc "select count(*) from g6_lab.task")
echo "g6_lab.task rows=$N"
echo "DB-SETUP OK"
