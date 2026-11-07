#!/usr/bin/env bash
# E01 门禁自检：故意破坏重复键语义，确认 run_tests.sh 最终非零。
set -uo pipefail

cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
cp -r src tests scripts "$tmp"/

# 主动破坏：重复键不再把 replaced 置 1，test_duplicate_key 必须失败。
sed -i 's/\*replaced = 1;/\*replaced = 0;/' "$tmp/src/hashmap.c"

( cd "$tmp" && bash scripts/run_tests.sh > gate.log 2>&1 )
rc=$?

{
    echo "captured_at: $(date -Is)"
    echo "broken: hashmap.c duplicate path replaced=1 -> replaced=0"
    echo "gate_exit=$rc (expected non-zero)"
    echo
    echo "--- 失败证据 ---"
    grep -hE 'FAIL|fails=[1-9]|GATE FAIL' "$tmp/evidence/test_run.txt" "$tmp/gate.log" 2>/dev/null | head -20
} > evidence/gate_selftest.txt

rm -rf "$tmp"

if [ "$rc" -eq 0 ]; then
    echo "SELFTEST FAIL: 破坏后门禁仍返回 0" >&2
    exit 1
fi
if ! grep -qE 'test_hashmap.*fails=[1-9]|GATE FAIL' evidence/gate_selftest.txt; then
    echo "SELFTEST FAIL: 未捕获到 test_hashmap 失败" >&2
    exit 1
fi
echo "SELFTEST PASS: 破坏后门禁退出码 $rc，失败被记录"
exit 0