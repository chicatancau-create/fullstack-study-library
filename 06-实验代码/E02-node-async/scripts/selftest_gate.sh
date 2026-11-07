#!/usr/bin/env bash
# E02 门禁自检：故意破坏 failFast 的触发判断，确认 run_all.sh 最终非零。
set -uo pipefail

cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
cp -r src tests scripts scenarios package.json "$tmp"/

# 主动破坏：submit 不再因 failFastTriggered 拒绝新任务。
sed -i 's/if (this.#failFastTriggered) {/if (false) {/' "$tmp/src/pool.mjs"

( cd "$tmp" && bash scripts/run_all.sh > gate.log 2>&1 )
rc=$?

{
    echo "captured_at: $(date -Is)"
    echo "broken: pool.mjs submit failFastTriggered branch disabled"
    echo "gate_exit=$rc (expected non-zero)"
    echo
    echo "--- 失败证据 ---"
    grep -hE '^not ok|fails=[1-9]|GATE FAIL' "$tmp/evidence/test_regressions.txt" "$tmp/gate.log" 2>/dev/null | head -20
} > evidence/gate_selftest.txt

rm -rf "$tmp"

if [ "$rc" -eq 0 ]; then
    echo "SELFTEST FAIL: 破坏后门禁仍返回 0" >&2
    exit 1
fi
if ! grep -qE '^not ok|GATE FAIL' evidence/gate_selftest.txt; then
    echo "SELFTEST FAIL: 未捕获到回归测试失败" >&2
    exit 1
fi
echo "SELFTEST PASS: 破坏后门禁退出码 $rc，失败被记录"
exit 0