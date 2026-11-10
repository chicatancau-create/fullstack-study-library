#!/usr/bin/env bash
# G4 全套证据：函数题 + 真实 PostgreSQL（越权/注入/乐观锁/分页/事务回滚）+ 迁移回滚 + 变异检测。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
FAILED=0

export PGPASSWORD="${PGPASSWORD:-study-pass}"
export PGDATABASE="${PGDATABASE:-study_lab}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGUSER="${PGUSER:-study}"

report() { if [ "$2" -eq 0 ]; then echo "PASS $1" | tee -a "$3"; else echo "FAIL $1 rc=$2" | tee -a "$3"; FAILED=1; fi }

# 1) 旧函数题
node 自测脚本/grade.mjs 参考答案/index.mjs > evidence/judge-solution.txt 2>&1
report "函数题·参考答案通过" $? evidence/judge-solution.txt
node 自测脚本/grade.mjs 起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL 函数题·起始代码本应被拒" | tee -a evidence/judge-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt; fi

# 2) 数据库环境（不可用则 SKIP 并记录，不伪装通过）
bash scripts/db_setup.sh > evidence/db-setup.txt 2>&1
if grep -q "DB-SETUP OK" evidence/db-setup.txt; then
  echo "PASS 数据库环境" | tee -a evidence/db-setup.txt

  node 自测脚本/grade-db.mjs 参考答案/db/access.mjs > evidence/db-solution.txt 2>&1
  report "数据库·参考答案 10/10" $? evidence/db-solution.txt
  node 自测脚本/grade-db.mjs 起始代码/db/access.mjs > evidence/db-starter.txt 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then echo "FAIL 数据库·起始代码本应被拒" | tee -a evidence/db-starter.txt; FAILED=1;
  else echo "starter_rejected=YES rc=$rc" | tee -a evidence/db-starter.txt; fi

  node scripts/mutation_check.mjs > evidence/mutation.txt 2>&1
  report "变异检测 4/4" $? evidence/mutation.txt
else
  echo "SKIP 数据库不可用（见 evidence/db-setup.txt）；数据库题未实测" | tee -a evidence/db-setup.txt
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then echo "SELF-TEST FAIL"; exit 1; fi
echo "SELF-TEST PASS"
