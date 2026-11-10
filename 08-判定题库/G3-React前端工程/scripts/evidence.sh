#!/usr/bin/env bash
# G3 全套证据：函数题 + 真实 Vite React 应用 + 构建产物检查 + 变异检测。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
FAILED=0

report() { # $1=名称 $2=退出码 $3=证据文件
  if [ "$2" -eq 0 ]; then echo "PASS $1" | tee -a "$3"; else echo "FAIL $1 rc=$2" | tee -a "$3"; FAILED=1; fi
}

# 1) 函数题
node 自测脚本/grade.mjs 参考答案/index.mjs > evidence/judge-solution.txt 2>&1
report "函数题·参考答案通过" $? evidence/judge-solution.txt
node 自测脚本/grade.mjs 起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL 函数题·起始代码本应被拒" | tee -a evidence/judge-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt; fi

# 2) 真实 Vite React 应用：构建 + 组件级断言
bash scripts/build_app.sh 参考答案/app > evidence/build-answer.txt 2>&1
report "应用·参考答案构建" $? evidence/build-answer.txt
node 自测脚本/grade-react.mjs 参考答案/app > evidence/react-solution.txt 2>&1
report "应用·参考答案 6/6" $? evidence/react-solution.txt
node 自测脚本/grade-build.mjs 参考答案/app > evidence/build-checks.txt 2>&1
report "应用·构建产物 4/4" $? evidence/build-checks.txt

bash scripts/build_app.sh 起始代码/app > evidence/build-starter.txt 2>&1
report "应用·起始代码构建" $? evidence/build-starter.txt
node 自测脚本/grade-react.mjs 起始代码/app > evidence/react-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL 应用·起始代码本应被拒" | tee -a evidence/react-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/react-starter.txt; fi

# 3) 自测脚本有效性
node scripts/mutation_check.mjs > evidence/mutation.txt 2>&1
report "变异检测 5/5" $? evidence/mutation.txt

if [ "$FAILED" -ne 0 ]; then echo "SELF-TEST FAIL"; exit 1; fi
echo "SELF-TEST PASS"
