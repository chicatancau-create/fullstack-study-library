#!/usr/bin/env bash
# G6 全套证据：函数题 + 多租户脚手架（隔离/RBAC/审计/批量逐项/软删/兼容变更）+ 变异检测。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
FAILED=0

export PGPASSWORD="${PGPASSWORD:-study-pass}"
export PGDATABASE="${PGDATABASE:-study_lab}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGUSER="${PGUSER:-study}"

report() { if [ "$2" -eq 0 ]; then echo "PASS $1" | tee -a "$3"; else echo "FAIL $1 rc=$2" | tee -a "$3"; FAILED=1; fi }

node 自测脚本/grade.mjs 参考答案/index.mjs > evidence/judge-solution.txt 2>&1
report "函数题·参考答案通过" $? evidence/judge-solution.txt
node 自测脚本/grade.mjs 起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL 函数题·起始代码本应被拒" | tee -a evidence/judge-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt; fi

bash scripts/db_setup.sh > evidence/db-setup.txt 2>&1
if grep -q "DB-SETUP OK" evidence/db-setup.txt; then
  echo "PASS 多租户库环境" | tee -a evidence/db-setup.txt

  node 自测脚本/grade-tenant.mjs 参考答案/db/tenant.mjs > evidence/tenant-solution.txt 2>&1
  report "多租户·参考答案 14/14" $? evidence/tenant-solution.txt
  node 自测脚本/grade-tenant.mjs 起始代码/db/tenant.mjs > evidence/tenant-starter.txt 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then echo "FAIL 多租户·起始代码本应被拒" | tee -a evidence/tenant-starter.txt; FAILED=1;
  else echo "starter_rejected=YES rc=$rc" | tee -a evidence/tenant-starter.txt; fi

  node scripts/mutation_check.mjs > evidence/mutation.txt 2>&1
  report "变异检测 5/5" $? evidence/mutation.txt
else
  echo "SKIP 数据库不可用（见 evidence/db-setup.txt）；多租户题未实测" | tee -a evidence/db-setup.txt
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then echo "SELF-TEST FAIL"; exit 1; fi
echo "SELF-TEST PASS"
