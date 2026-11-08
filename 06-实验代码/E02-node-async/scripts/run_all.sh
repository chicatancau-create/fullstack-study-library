#!/usr/bin/env bash
# E02 证据采集与门禁：环境、六个测试、三个反例、速率对照。
# 缺测试、缺 PASS、fails>0、证据为空、场景输出 NO/“不成立”均计失败；最终非零。
set -uo pipefail

cd "$(dirname "$0")/.."
mkdir -p evidence

failures=0
fail() {
    echo "!! GATE FAIL: $*" >&2
    failures=$((failures + 1))
}

run_step() {
    local out="$1"
    local label="$2"
    shift 2
    echo "== $label =="
    echo "\$ $*"
    "$@" > "evidence/$out" 2>&1
    local rc=$?
    if [ -s "evidence/$out" ]; then
        tail -5 "evidence/$out"
    else
        fail "$label 没有产生证据（evidence/$out 为空）"
    fi
    echo "exit=$rc"
    echo
    if [ "$rc" -ne 0 ]; then
        failures=$((failures + 1))
        echo "!! $label 非零退出（$rc），详见 evidence/$out"
        echo
    fi
}

check_test() {
    local name="$1"
    local file="evidence/$name.txt"
    if [ ! -s "$file" ]; then
        fail "$name 缺证据文件"
        return
    fi
    if ! grep -qE 'checks=[0-9]+ fails=0 : PASS' "$file"; then
        fail "$name 未出现 checks=N fails=0 : PASS"
    fi
    if grep -q '^not ok' "$file"; then
        fail "$name 存在 not ok"
    fi
}

# ---------- 1. 环境 ----------
run_step env.txt "环境探测（真实执行）" node scripts/env.mjs

# ---------- 2. 六个测试 ----------
TESTS=(test_pool test_ordering test_failure test_cancel test_timeout test_regressions test_cross_process)
run_step test_pool.txt        "基础语义：并发上限 / FIFO / 队列上限 / 关闭 / 同步异常 / 参数校验" node tests/test_pool.mjs
run_step test_ordering.txt    "确定性乱序完成"                                                    node tests/test_ordering.mjs
run_step test_failure.txt     "首项失败：运行中与待运行任务的处理"                                  node tests/test_failure.mjs
run_step test_cancel.txt      "取消：全部 Promise 结算，底层不消失"                                 node tests/test_cancel.mjs
run_step test_timeout.txt     "超时：调用方停止等待，不等于底层撤销"                                node tests/test_timeout.mjs
run_step test_regressions.txt "回归：空池等位 / 关闭 / failFast 真值性 / 监听器清理 / 参数矩阵 / 取消×超时" node tests/test_regressions.mjs
run_step test_cross_process.txt "跨进程取消：父进程通过 IPC 取消子进程任务" node tests/test_cross_process.mjs

for t in "${TESTS[@]}"; do
    check_test "$t"
done

# ---------- 3. 测试汇总 ----------
{
    echo "captured_at: $(date -Is)"
    echo
    echo "== 各测试判定 =="
    for f in "${TESTS[@]}"; do
        printf '%-18s %s\n' "$f" "$(grep -E 'checks=[0-9]+ fails=[0-9]+ : (PASS|FAIL)' "evidence/$f.txt" | tail -1)"
    done
    echo
    echo "== 失败项（如有）=="
    if grep -h '^not ok' evidence/test_*.txt 2>/dev/null; then
        :
    else
        echo "无"
    fi
} > evidence/test_run.txt 2>&1
[ -s evidence/test_run.txt ] || fail "test_run.txt 为空"

# ---------- 4. 三个反例 ----------
run_step cx_unbounded_concurrency.txt "反例 1：无界并发"           node --expose-gc scenarios/cx_unbounded_concurrency.mjs
run_step cx_busy_loop.txt             "反例 2：同步 CPU 忙循环"     node scenarios/cx_busy_loop.mjs
run_step cx_fast_producer.txt         "反例 3：生产快于消费"        node --expose-gc scenarios/cx_fast_producer.mjs

# ---------- 5. 速率变化下的有界性 ----------
run_step backpressure_rates.txt "背压：改变生产/消费速率后仍有界" node scenarios/backpressure_rates.mjs

# ---------- 5.5 worker_threads：CPU 密集任务 ----------
run_step worker_threads.txt "worker_threads：CPU 密集任务的并行与事件循环响应" node scenarios/worker_threads.mjs

# ---------- 6. 场景判定必须可门禁 ----------
for f in evidence/cx_*.txt evidence/backpressure_rates.txt evidence/worker_threads.txt; do
    [ -s "$f" ] || fail "场景证据缺失：$f"
    if grep -qE '(^|[^A-Za-z])NO([^A-Za-z]|$)|不成立' "$f"; then
        fail "场景出现 NO/不成立：$f"
    fi
done

# ---------- 7. 换行归一化 ----------
for f in evidence/*.txt; do
    sed -i 's/\r$//' "$f"
done

# ---------- 8. 摘要 ----------
echo "===== 摘要 ====="
grep -E 'checks=[0-9]+ fails=[0-9]+ : (PASS|FAIL)' evidence/test_run.txt
echo
echo "反例 1 并发峰值: $(grep -oE 'Promise.all（无界）[[:space:]]+[0-9]+' evidence/cx_unbounded_concurrency.txt | grep -oE '[0-9]+$') (无界) /" \
     "$(grep -oE 'TaskPool（上限 20）[[:space:]]+[0-9]+' evidence/cx_unbounded_concurrency.txt | grep -oE '[0-9]+$') (有界)"
echo "反例 2 定时器被拖延: $(grep -oE '定时器实际晚到 [0-9.]+ms' evidence/cx_busy_loop.txt)"
echo "反例 2 4 个忙任务总耗时: $(grep -oE '总耗时 [0-9.]+ms ≈ 4 × 100ms' evidence/cx_busy_loop.txt)"
echo "反例 3 队列峰值: $(grep -oE '队列峰值 [0-9]+ 条' evidence/cx_fast_producer.txt | head -1) (无界)" \
     "/ $(grep -oE 'pending 峰值 [0-9]+（上界 40）' evidence/cx_fast_producer.txt | head -1) (有界)"
echo "速率对照: $(grep -c 'YES$' evidence/backpressure_rates.txt) 档全部满足 pending<=20"
echo "worker_threads: $(grep -oE 'speedup=[0-9.]+x' evidence/worker_threads.txt) / $(grep -oE 'event_loop_responsive=YES' evidence/worker_threads.txt)"
echo
echo "非零退出环节: $failures"
if [ "$failures" -ne 0 ]; then
    exit 1
fi
exit 0