#!/usr/bin/env bash
# G7 全套证据：函数题 + 真实 MySQL 隔离/锁/死锁 + 变异检测。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
FAILED=0

export MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
export MYSQL_PORT="${MYSQL_PORT:-3307}"
export MYSQL_USER="${MYSQL_USER:-study}"
export MYSQL_PASSWORD="${MYSQL_PASSWORD:-study-pass}"

report() { if [ "$2" -eq 0 ]; then echo "PASS $1" | tee -a "$3"; else echo "FAIL $1 rc=$2" | tee -a "$3"; FAILED=1; fi }

node 自测脚本/grade.mjs 参考答案/index.mjs > evidence/judge-solution.txt 2>&1
report "函数题·参考答案通过" $? evidence/judge-solution.txt
node 自测脚本/grade.mjs 起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL 函数题·起始代码本应被拒" | tee -a evidence/judge-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt; fi

bash scripts/db_setup.sh > evidence/mysql-setup.txt 2>&1
if grep -q "DB-SETUP OK" evidence/mysql-setup.txt; then
  echo "PASS MySQL 环境" | tee -a evidence/mysql-setup.txt

  node 自测脚本/grade-mysql.mjs 参考答案/db/mysql_lab.mjs > evidence/mysql-solution.txt 2>&1
  report "MySQL·参考答案 7/7" $? evidence/mysql-solution.txt
  node 自测脚本/grade-mysql.mjs 起始代码/db/mysql_lab.mjs > evidence/mysql-starter.txt 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then echo "FAIL MySQL·起始代码本应被拒" | tee -a evidence/mysql-starter.txt; FAILED=1;
  else echo "starter_rejected=YES rc=$rc" | tee -a evidence/mysql-starter.txt; fi

  node scripts/mutation_check.mjs > evidence/mutation.txt 2>&1
  report "变异检测 4/4" $? evidence/mutation.txt
else
  echo "SKIP MySQL 不可用（见 evidence/mysql-setup.txt）；MySQL 题未实测" | tee -a evidence/mysql-setup.txt
  FAILED=1
fi

# 3) JVM 死锁诊断（真编译 + 真检测 ThreadMXBean）
if command -v javac >/dev/null 2>&1; then
  JVM_OUT="${TMPDIR:-/tmp}/g7-jvm"
  rm -rf "$JVM_OUT"; mkdir -p "$JVM_OUT"
  if javac -d "$JVM_OUT" jvm/Deadlock.java > evidence/jvm-compile.txt 2>&1; then
    echo "PASS JVM 编译" | tee -a evidence/jvm-compile.txt
    java -cp "$JVM_OUT" Deadlock 3000 > evidence/jvm-deadlock.txt 2>&1
    if grep -q "deadlocked_threads=2" evidence/jvm-deadlock.txt; then
      echo "PASS JVM 死锁检测（ThreadMXBean 找到 2 条）" | tee -a evidence/jvm-deadlock.txt
    else
      echo "FAIL JVM 死锁检测" | tee -a evidence/jvm-deadlock.txt
      FAILED=1
    fi
  else
    echo "FAIL JVM 编译" | tee -a evidence/jvm-compile.txt
    FAILED=1
  fi
else
  echo "SKIP 本机无 javac；JVM 题未实测" | tee evidence/jvm-compile.txt
fi

if [ "$FAILED" -ne 0 ]; then echo "SELF-TEST FAIL"; exit 1; fi
echo "SELF-TEST PASS"
