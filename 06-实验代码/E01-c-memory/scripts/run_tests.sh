#!/usr/bin/env bash
# E01 证据采集与门禁：环境、构建、正常测试、注入、调试器定位、修复回归。
# 任一必需步骤失败最终非零；预期 SIGSEGV 必须同时匹配退出码、信号和源码行。
set -uo pipefail

cd "$(dirname "$0")/.."
mkdir -p evidence

GATE_FAILS=0
fail() {
    printf 'GATE FAIL: %s\n' "$*" >&2
    GATE_FAILS=$((GATE_FAILS + 1))
}

# ---------- 1. 环境 ----------
{
    echo "captured_at: $(date -Is)"
    echo
    echo "--- OS / shell ---"
    uname -a
    echo
    echo "--- compiler ---"
    gcc --version | head -1
    echo
    echo "--- debugger ---"
    gdb --version | head -1
    echo
    echo "--- toolchain availability ---"
    for t in make clang valgrind cl; do
        if command -v "$t" >/dev/null 2>&1; then
            echo "$t: $($t --version 2>/dev/null | head -1)"
        else
            echo "$t: NOT AVAILABLE"
        fi
    done
    echo
    echo "--- AddressSanitizer probe (真实执行，不转抄结论) ---"
    probe_dir=build/probe
    mkdir -p "$probe_dir"

    asan_lib=$(gcc -print-file-name=libasan.dll)
    asan_lib_rc=$?
    echo "\$ gcc -print-file-name=libasan.dll"
    echo "$asan_lib"
    echo "exit=$asan_lib_rc"
    if [ "$asan_lib" = "libasan.dll" ]; then
        echo "=> 回显值等于入参，说明 gcc 未定位到该库文件"
    else
        echo "=> 库文件位置: $asan_lib"
    fi
    echo

    cat > "$probe_dir/asan_probe.c" <<'PROBE_EOF'
#include <stdlib.h>
int main(void) {
    int *p = malloc(sizeof(int) * 4);
    p[4] = 1;   /* 越过末尾 1 个元素 */
    free(p);
    return 0;
}
PROBE_EOF
    echo "\$ gcc -fsanitize=address -g -O0 $probe_dir/asan_probe.c -o $probe_dir/asan_probe.exe"
    asan_cc_out=$(gcc -fsanitize=address -g -O0 "$probe_dir/asan_probe.c" -o "$probe_dir/asan_probe.exe" 2>&1)
    asan_cc_rc=$?
    if [ -n "$asan_cc_out" ]; then
        echo "--- stdout/stderr ---"
        echo "$asan_cc_out"
    fi
    echo "exit=$asan_cc_rc"
    echo

    if [ "$asan_cc_rc" -eq 0 ] && [ -x "$probe_dir/asan_probe.exe" ]; then
        echo "\$ ./$probe_dir/asan_probe.exe"
        asan_run_out=$(./"$probe_dir/asan_probe.exe" 2>&1)
        asan_run_rc=$?
        echo "$asan_run_out"
        echo "exit=$asan_run_rc"
        if echo "$asan_run_out" | grep -q 'heap-buffer-overflow'; then
            echo "=> ASan: AVAILABLE，越界已被告警并中止（退出码 $asan_run_rc）"
        else
            echo "=> ASan: 可链接，但本次未产生 heap-buffer-overflow 报告"
        fi
    else
        echo "=> ASan: NOT AVAILABLE（依据上面真实的编译/链接输出与退出码判定）"
    fi
} > evidence/env.txt 2>&1
[ -s evidence/env.txt ] || fail "evidence/env.txt 缺失或为空"
command -v gdb >/dev/null 2>&1 || fail "gdb 不可用，无法验证诊断位置"

# ---------- 2. 构建（先构建一次，确保 7 个产物齐全） ----------
bash scripts/build.sh > evidence/build.txt 2>&1
build_rc=$?
cat evidence/build.txt
[ "$build_rc" -eq 0 ] || fail "build.sh 退出码 $build_rc"

for bin in test_dynarray test_hashmap fault_guard fault_guard_fixed fault_plain fault_uaf fault_uaf_fixed; do
    [ -x "build/$bin.exe" ] || fail "缺少 build/$bin.exe"
done

# ---------- 3. 正常测试（干净重建后逐个断言） ----------
: > evidence/test_run.txt
rm -rf build
bash scripts/build.sh >> evidence/test_run.txt 2>&1
rebuild_rc=$?
[ "$rebuild_rc" -eq 0 ] || fail "干净重建退出码 $rebuild_rc"

first_test=1
for t in test_dynarray test_hashmap; do
    raw="evidence/.$t.raw"
    ./build/$t.exe > "$raw" 2>&1
    rc=$?
    if [ "$first_test" -eq 1 ]; then
        first_test=0
    else
        echo >> evidence/test_run.txt
    fi
    {
        echo "== $t =="
        cat "$raw"
        echo "exit=$rc"
    } >> evidence/test_run.txt
    [ "$rc" -eq 0 ] || fail "$t 退出码 $rc"
    grep -q 'fails=0' "$raw" || fail "$t 缺少 fails=0"
    grep -q 'PASS' "$raw" || fail "$t 缺少 PASS"
    rm -f "$raw"
done

# ---------- 3b. 对照：普通堆越界不崩（不是安全证明） ----------
{
    echo "== 对照组：普通 malloc 上的 arr[4] 越界写 =="
    ./build/fault_plain.exe
    echo "exit=$?   # 0 = 正常退出，这正是不可靠之处"
} > evidence/fault_plain.txt 2>&1
grep -q 'no crash observed' evidence/fault_plain.txt || fail "对照组未出现预期的静默越界"

# ---------- 4. 越界注入 + 调试器定位（精确信号与行号） ----------
guard_line=$(grep -n '\[idx\] = 123' tests/fault_guard.c | head -1 | cut -d: -f1)
[ -n "$guard_line" ] || fail "找不到 fault_guard.c 的越界写行"
raw=evidence/.fault_guard.raw
./build/fault_guard.exe > "$raw" 2>&1
guard_rc=$?
{
    echo "== 注入版：4 个元素后越界写 arr[4]（守护页紧贴末尾） =="
    cat "$raw"
    echo "exit=$guard_rc   # 139 = SIGSEGV"
    echo
    echo "== gdb 定位 =="
    gdb -q -batch \
        -ex "run" \
        -ex "echo \n--- backtrace ---\n" \
        -ex "bt" \
        -ex "echo \n--- faulting line ---\n" \
        -ex "frame 0" \
        -ex "info line *\$pc" \
        -ex "echo \n--- locals ---\n" \
        -ex "info locals" \
        -ex "echo \n--- source context ---\n" \
        -ex "list" \
        ./build/fault_guard.exe 2>&1 | grep -v '^warning: \[TSBX\]' | grep -v '^\[New Thread'
} > evidence/fault_inject.txt 2>&1
rm -f "$raw"
[ "$guard_rc" -eq 139 ] || fail "越界注入退出码 $guard_rc，期望 139 (SIGSEGV)"
grep -q 'SIGSEGV' evidence/fault_inject.txt || fail "越界注入未记录 SIGSEGV"
grep -q "tests/fault_guard.c:$guard_line" evidence/fault_inject.txt \
    || fail "越界定位行不是 tests/fault_guard.c:$guard_line"

# ---------- 5. 修复后回归（同一份测试源码，只开边界检查） ----------
{
    echo "== 修复版：同一份 fault_guard.c，-DFIXED_BOUNDS 先判 idx >= len =="
    ./build/fault_guard_fixed.exe
    echo "exit=$?   # 0 = 拒绝越界且未触碰守护页"
} > evidence/fault_fixed.txt 2>&1
grep -q 'rejected:' evidence/fault_fixed.txt || fail "修复版未输出 rejected"
grep -q '^exit=0' evidence/fault_fixed.txt || fail "修复版未以 0 退出"

# ---------- 6. UAF 平台替代：PAGE_NOACCESS 模拟释放 ----------
uaf_line=$(grep -n 'printf("unexpected read' tests/fault_uaf.c | head -1 | cut -d: -f1)
[ -n "$uaf_line" ] || fail "找不到 fault_uaf.c 的读取行"
raw=evidence/.fault_uaf.raw
./build/fault_uaf.exe > "$raw" 2>&1
uaf_rc=$?
{
    echo "== UAF 注入：模拟 free 后读取 =="
    cat "$raw"
    echo "exit=$uaf_rc   # 139 = SIGSEGV"
    echo
    echo "== gdb 定位 =="
    gdb -q -batch \
        -ex "run" \
        -ex "echo \n--- backtrace ---\n" \
        -ex "bt" \
        -ex "frame 0" \
        -ex "info line *\$pc" \
        ./build/fault_uaf.exe 2>&1 | grep -v '^warning: \[TSBX\]' | grep -v '^\[New Thread'
} > evidence/fault_uaf.txt 2>&1
rm -f "$raw"
[ "$uaf_rc" -eq 139 ] || fail "UAF 注入退出码 $uaf_rc，期望 139 (SIGSEGV)"
grep -q 'SIGSEGV' evidence/fault_uaf.txt || fail "UAF 注入未记录 SIGSEGV"
grep -q "tests/fault_uaf.c:$uaf_line" evidence/fault_uaf.txt \
    || fail "UAF 定位行不是 tests/fault_uaf.c:$uaf_line"

{
    echo "== UAF 修复版：不读取已标记不可访问的页 =="
    ./build/fault_uaf_fixed.exe
    echo "exit=$?   # 0 = 未触发访问"
} > evidence/fault_uaf_fixed.txt 2>&1
grep -q 'skipped read' evidence/fault_uaf_fixed.txt || fail "UAF 修复版未跳过读取"
grep -q '^exit=0' evidence/fault_uaf_fixed.txt || fail "UAF 修复版未以 0 退出"

# ---------- 7. 证据完整性 ----------
for f in env build test_run fault_plain fault_inject fault_fixed fault_uaf fault_uaf_fixed; do
    [ -s "evidence/$f.txt" ] || fail "evidence/$f.txt 缺失或为空"
done

# 换行归一化，避免证据文件带 CRLF 尾随空白。
for f in evidence/*.txt; do
    sed -i 's/\r$//' "$f"
done

echo
echo "===== 摘要 ====="
grep -h 'PASS\|FAIL' evidence/test_run.txt || true
echo "越界注入: $(grep -c 'SIGSEGV' evidence/fault_inject.txt) 次 SIGSEGV 记录，" \
     "定位行: $(grep -o 'tests/fault_guard.c:[0-9]*' evidence/fault_inject.txt | head -1)"
echo "UAF 注入: $(grep -c 'SIGSEGV' evidence/fault_uaf.txt) 次 SIGSEGV 记录，" \
     "定位行: $(grep -o 'tests/fault_uaf.c:[0-9]*' evidence/fault_uaf.txt | head -1)"
tail -2 evidence/fault_fixed.txt
echo "对照组: $(grep -c 'no crash observed' evidence/fault_plain.txt) 次静默越界（未崩溃）"
echo "构建退出码: $build_rc"
echo "门禁失败数: $GATE_FAILS"

if [ "$GATE_FAILS" -ne 0 ]; then
    exit 1
fi
exit 0