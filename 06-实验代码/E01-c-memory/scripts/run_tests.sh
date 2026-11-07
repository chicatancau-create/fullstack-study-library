#!/usr/bin/env bash
# E01 证据采集：环境、构建、正常测试、失败注入与调试器定位、修复后回归。
# 全部输出写入 evidence/，可重复执行覆盖。
set -uo pipefail

cd "$(dirname "$0")/.."
mkdir -p evidence

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

    # (1) 库文件查询：gcc 找不到库时会原样回显传入的文件名
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

    # (2) 最小堆越界程序，实际编译并链接
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

    # (3) 编译成功才实际运行，用真实诊断输出判定 ASan 是否生效
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

# ---------- 2. 构建 ----------
bash scripts/build.sh > evidence/build.txt 2>&1
build_rc=$?
cat evidence/build.txt

# ---------- 3. 正常测试（干净环境：删掉旧产物后重建） ----------
{
    echo "== clean rebuild: rm -rf build && bash scripts/build.sh =="
    rm -rf build
    bash scripts/build.sh
    echo
    echo "== test_dynarray =="
    ./build/test_dynarray.exe
    echo "exit=$?"
    echo
    echo "== test_hashmap =="
    ./build/test_hashmap.exe
    echo "exit=$?"
} > evidence/test_run.txt 2>&1

# ---------- 3b. 对照组：普通堆上的同一越界写 ----------
{
    echo "== 对照组：普通 malloc 上的 arr[4] 越界写 =="
    ./build/fault_plain.exe
    echo "exit=$?   # 0 = 正常退出，这正是不可靠之处"
} > evidence/fault_plain.txt 2>&1

# ---------- 4. 失败注入：越界写 + 调试器定位 ----------
{
    echo "== 注入版：4 个元素后越界写 arr[4]（守护页紧贴末尾） =="
    ./build/fault_guard.exe
    echo "exit=$?   # 139 = SIGSEGV"
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

# ---------- 5. 修复后回归（同一份测试源码，只开边界检查） ----------
{
    echo "== 修复版：同一份 fault_guard.c，-DFIXED_BOUNDS 先判 idx >= len =="
    ./build/fault_guard_fixed.exe
    echo "exit=$?   # 0 = 拒绝越界且未触碰守护页"
} > evidence/fault_fixed.txt 2>&1

# ---------- 6. 换行归一化 ----------
# Windows 工具（ld.exe、gdb 等）输出 CRLF；去掉行尾 \r，避免证据文件带尾随空白。
for f in evidence/*.txt; do
    sed -i 's/\r$//' "$f"
done

echo
echo "===== 摘要 ====="
grep -h 'PASS\|FAIL' evidence/test_run.txt || true
echo "注入版: $(grep -c 'SIGSEGV' evidence/fault_inject.txt) 次 SIGSEGV 记录，" \
     "定位行: $(grep -o 'tests/fault_guard.c:[0-9]*' evidence/fault_inject.txt | head -1)"
tail -2 evidence/fault_fixed.txt
echo "对照组: $(grep -c 'no crash observed' evidence/fault_plain.txt) 次静默越界（未崩溃）"
echo "构建退出码: $build_rc"
