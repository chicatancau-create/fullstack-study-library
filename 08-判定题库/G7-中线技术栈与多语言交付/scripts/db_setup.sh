#!/usr/bin/env bash
# G7 MySQL 环境准备：只操作 g7_lab 库（stock / seat 两张表）。
set -uo pipefail

MYSQL="${MYSQL:-D:/MySQL/server/bin/mysql.exe}"
HOST="${MYSQL_HOST:-127.0.0.1}"
PORT="${MYSQL_PORT:-3307}"
USER="${MYSQL_USER:-study}"
PASS="${MYSQL_PASSWORD:-study-pass}"

if [ ! -x "$MYSQL" ]; then
  echo "SKIP: 找不到 mysql 客户端（$MYSQL）；MySQL 题未实测。"
  exit 0
fi

cd "$(dirname "$0")/.."
MYSQL_PWD="$PASS" "$MYSQL" -h "$HOST" -P "$PORT" -u "$USER" < db/mysql_lab.sql 2>&1 | grep -v "Warning" || true

LEVEL=$(MYSQL_PWD="$PASS" "$MYSQL" -h "$HOST" -P "$PORT" -u "$USER" -N -B -e "select @@transaction_isolation from g7_lab.stock limit 1" 2>/dev/null)
AVAIL=$(MYSQL_PWD="$PASS" "$MYSQL" -h "$HOST" -P "$PORT" -u "$USER" -N -B -e "select available from g7_lab.stock where sku='hot'" 2>/dev/null)
echo "mysql isolation=$LEVEL stock.hot=$AVAIL"
if [ "$AVAIL" != "5" ]; then
  echo "DB-SETUP FAIL: 种子未就绪"
  exit 1
fi
echo "DB-SETUP OK"
