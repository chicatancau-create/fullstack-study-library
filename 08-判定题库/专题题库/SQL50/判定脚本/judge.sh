#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGPASSWORD:?需要本地合成库凭据 PGPASSWORD}"
PSQL=${PSQL:-psql}
export PGOPTIONS='-c search_path=sql50'
mkdir -p evidence

"$PSQL" -q -v ON_ERROR_STOP=1 -f 数据/schema.sql
"$PSQL" -q -v ON_ERROR_STOP=1 -f 数据/seed.sql

CAND=${CANDIDATE:-答案}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
pass=0
fail=0
for f in 答案/Q*.sql; do
  q=$(basename "$f")
  "$PSQL" -At -F '|' -v ON_ERROR_STOP=1 -f "答案/$q" > "$TMP/expected.txt"
  if [ -f "$CAND/$q" ]; then
    "$PSQL" -At -F '|' -v ON_ERROR_STOP=1 -f "$CAND/$q" > "$TMP/actual.txt"
  else
    : > "$TMP/actual.txt"
  fi
  if diff -q "$TMP/expected.txt" "$TMP/actual.txt" >/dev/null; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    echo "FAIL $q"
    diff -u "$TMP/expected.txt" "$TMP/actual.txt" | head -8 || true
  fi
done

SUMMARY=${JUDGE_SUMMARY:-evidence/judge.txt}
echo "passed=$pass failed=$fail" > "$SUMMARY"

if [ "${SELFTEST:-0}" = "1" ]; then
  mkdir -p "$TMP/mut"
  cp 答案/*.sql "$TMP/mut/"
  printf 'SELECT 999 AS v;\n' > "$TMP/mut/Q01.sql"
  set +e
  JUDGE_SUMMARY="$TMP/mut-summary.txt" SELFTEST=0 CANDIDATE="$TMP/mut" bash "$0" > "$TMP/mut.log" 2>&1
  rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    echo "selftest_rejected=NO" >> "$SUMMARY"
    echo "SELFTEST FAILED: 错误答案未被拒绝"
    exit 1
  fi
  echo "selftest_rejected=YES" >> "$SUMMARY"
fi

[ "$fail" -eq 0 ] || exit 1
echo "SQL50 PASS $pass/50"
