#!/usr/bin/env bash
# G5 交易库环境准备：只操作 schema g5_lab。
set -uo pipefail

PSQL="${PSQL:-D:/PostgreSQL/18/bin/psql.exe}"
HOST="${PGHOST:-127.0.0.1}"
USER="${PGUSER:-study}"
DB="${PGDATABASE:-study_lab}"
export PGPASSWORD="${PGPASSWORD:-study-pass}"

if [ ! -x "$PSQL" ]; then
  echo "SKIP: 找不到 psql（$PSQL）；交易题未实测。"
  exit 0
fi

cd "$(dirname "$0")/.."
echo "apply db/schema.sql"
"$PSQL" -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f db/schema.sql || exit 1

AVAIL=$("$PSQL" -h "$HOST" -U "$USER" -d "$DB" -tAc "select available from g5_lab.stock where sku='sku-hot'")
echo "g5_lab.stock sku-hot available=$AVAIL"
echo "DB-SETUP OK"
