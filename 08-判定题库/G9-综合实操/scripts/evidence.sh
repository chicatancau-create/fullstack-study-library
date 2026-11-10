#!/usr/bin/env bash
# G9 全套证据：主函数 + A 卷 14 条 + B 卷 12 条 + 计时/算分脚本冒烟 + 变异检测。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence
FAILED=0

report() { if [ "$2" -eq 0 ]; then echo "PASS $1" | tee -a "$3"; else echo "FAIL $1 rc=$2" | tee -a "$3"; FAILED=1; fi }

# 0) 旧的主函数题
node 自测脚本/grade.mjs 参考答案/index.mjs > evidence/judge-solution.txt 2>&1
report "solvePaper·参考答案通过" $? evidence/judge-solution.txt
node 自测脚本/grade.mjs 起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL solvePaper·起始代码本应被拒" | tee -a evidence/judge-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt; fi

# 1) A 卷
node 自测脚本/grade-paper-a.mjs paperA/参考答案/index.mjs > evidence/paper-a-solution.txt 2>&1
report "A 卷·参考答案 14/14" $? evidence/paper-a-solution.txt
node 自测脚本/grade-paper-a.mjs paperA/起始代码/index.mjs > evidence/paper-a-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL A 卷·起始代码本应被拒" | tee -a evidence/paper-a-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/paper-a-starter.txt; fi

# 2) B 卷
node 自测脚本/grade-paper-b.mjs paperB/参考答案/index.mjs > evidence/paper-b-solution.txt 2>&1
report "B 卷·参考答案 13/13" $? evidence/paper-b-solution.txt
node 自测脚本/grade-paper-b.mjs paperB/起始代码/index.mjs > evidence/paper-b-starter.txt 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "FAIL B 卷·起始代码本应被拒" | tee -a evidence/paper-b-starter.txt; FAILED=1;
else echo "starter_rejected=YES rc=$rc" | tee -a evidence/paper-b-starter.txt; fi

# 3) 计时器与算分脚本冒烟（在临时目录跑，不污染仓库）
SMOKE="${TMPDIR:-/tmp}/g9-smoke"
rm -rf "$SMOKE"; mkdir -p "$SMOKE"
(
  cd "$SMOKE"
  node "$OLDPWD/自测脚本/timer.mjs" start
  node "$OLDPWD/自测脚本/timer.mjs" status
  node "$OLDPWD/自测脚本/timer.mjs" checkpoint t1
  node "$OLDPWD/自测脚本/timer.mjs" pause
  node "$OLDPWD/自测脚本/timer.mjs" resume
  node "$OLDPWD/自测脚本/timer.mjs" finalize
) > evidence/timer-smoke.txt 2>&1
report "计时器冒烟" $? evidence/timer-smoke.txt

cat > "$SMOKE/mine.json" <<'JSON'
{
  "business": { "主路径": 8, "数据不变量": 8, "状态/并发/幂等": 5, "边界与失败语义": 3 },
  "sec": { "对象/租户授权": 8, "认证与可信输入": 4, "秘密和错误边界": 3, "数据最小化": 2 },
  "test": { "失败先行": 5, "单元/集成/E2E": 5, "真实依赖和并发": 4, "根因证据": 3 },
  "delivery": { "干净启动": 4, "可复现/CI": 2, "迁移兼容": 2, "发布恢复": 2, "资源清理": 2 },
  "theory": { "算法正确性/复杂度": 4, "SQL": 2, "机制解释与反例": 3 },
  "comm": { "澄清": 2, "设计/取舍": 2, "评审处置": 1, "Runbook": 2, "答辩与自我修正": 2 }
}
JSON
node 自测脚本/score.mjs "$SMOKE/mine.json" > evidence/score-smoke.txt 2>&1
report "算分脚本冒烟" $? evidence/score-smoke.txt

# 4) 变异检测
node scripts/mutation_check.mjs > evidence/mutation.txt 2>&1
report "变异检测" $? evidence/mutation.txt

if [ "$FAILED" -ne 0 ]; then echo "SELF-TEST FAIL"; exit 1; fi
echo "SELF-TEST PASS"
