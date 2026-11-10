#!/usr/bin/env bash
# G1 四道子题全套证据：函数题 / 真站点 / HTTP 服务 / C 内存。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
FAILED=0

report() { # $1=名称 $2=退出码 $3=证据文件
  if [ "$2" -eq 0 ]; then
    echo "PASS $1" | tee -a "$3"
  else
    echo "FAIL $1 rc=$2" | tee -a "$3"
    FAILED=1
  fi
}

# 1) 函数题
node 自测脚本/grade.mjs 参考答案/index.mjs > evidence/judge-solution.txt 2>&1
report "函数题·参考答案通过" $? evidence/judge-solution.txt
node 自测脚本/grade.mjs 起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL 函数题·起始代码本应被拒" | tee -a evidence/judge-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt; fi

# 2) 真站点（Playwright + axe-core）
node 自测脚本/grade-site.mjs 参考答案/site/index.html > evidence/site-solution.txt 2>&1
report "站点·参考答案通过" $? evidence/site-solution.txt
node 自测脚本/grade-site.mjs 起始代码/site/index.html > evidence/site-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL 站点·起始页面本应被拒" | tee -a evidence/site-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/site-starter.txt; fi

# 3) HTTP 服务
node 自测脚本/grade-http.mjs 参考答案/server.mjs > evidence/http-solution.txt 2>&1
report "HTTP·参考答案通过" $? evidence/http-solution.txt
node 自测脚本/grade-http.mjs 起始代码/server.mjs > evidence/http-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL HTTP·起始服务本应被拒" | tee -a evidence/http-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/http-starter.txt; fi

# 4) C 内存题
bash scripts/run_c.sh 参考答案/c/ring_buffer.c "${TMPDIR:-/tmp}/g1-c-answer" > evidence/c-solution.txt 2>&1
report "C·参考答案通过" $? evidence/c-solution.txt
bash scripts/run_c.sh 起始代码/c/ring_buffer.c "${TMPDIR:-/tmp}/g1-c-starter" > evidence/c-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL C·起始代码本应被拒" | tee -a evidence/c-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/c-starter.txt; fi

# 5) 自测脚本有效性：8 个注入缺陷必须全部被抓
node scripts/mutation_check.mjs > evidence/mutation.txt 2>&1
report "变异检测 8/8" $? evidence/mutation.txt

if [ "$FAILED" -ne 0 ]; then
  echo "SELF-TEST FAIL"
  exit 1
fi
echo "SELF-TEST PASS"
