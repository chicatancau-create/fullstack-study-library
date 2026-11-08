#!/usr/bin/env bash
# E01 Linux/ASan 证据：真实 UAF 与泄漏检测。仅适用于有 libasan 的 Linux/CI。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence build/asan
out=evidence/asan_linux.txt
fail=0
: > "$out"

echo "gcc: $(gcc --version | head -1)" >> "$out"

gcc -std=c17 -fsanitize=address -g -O0 tests/fault_uaf_asan.c -o build/asan/uaf >> "$out" 2>&1 || fail=1
ASAN_OPTIONS=detect_leaks=1 ./build/asan/uaf > /tmp/e01-uaf.out 2>&1
uaf_rc=$?
cat /tmp/e01-uaf.out >> "$out"
echo "uaf_exit=$uaf_rc (expect non-zero)" >> "$out"
if ! grep -q "heap-use-after-free" /tmp/e01-uaf.out; then fail=1; fi
if [ "$uaf_rc" -eq 0 ]; then fail=1; fi

gcc -std=c17 -fsanitize=address -g -O0 tests/leak_asan.c -o build/asan/leak >> "$out" 2>&1 || fail=1
ASAN_OPTIONS=detect_leaks=1 ./build/asan/leak > /tmp/e01-leak.out 2>&1
leak_rc=$?
cat /tmp/e01-leak.out >> "$out"
echo "leak_exit=$leak_rc (expect non-zero)" >> "$out"
if ! grep -q "LeakSanitizer" /tmp/e01-leak.out; then fail=1; fi
if [ "$leak_rc" -eq 0 ]; then fail=1; fi

gcc -std=c17 -fsanitize=undefined -fno-sanitize-recover=all -g -O0 tests/ubsan_overflow.c -o build/asan/ubsan >> "$out" 2>&1 || fail=1
./build/asan/ubsan > /tmp/e01-ubsan.out 2>&1
ubsan_rc=$?
cat /tmp/e01-ubsan.out >> "$out"
echo "ubsan_exit=$ubsan_rc (expect non-zero)" >> "$out"
if ! grep -q "runtime error" /tmp/e01-ubsan.out; then fail=1; fi
if [ "$ubsan_rc" -eq 0 ]; then fail=1; fi

if command -v valgrind >/dev/null 2>&1; then
    gcc -std=c17 -g -O0 tests/leak_asan.c -o build/asan/leak_plain >> "$out" 2>&1 || fail=1
    valgrind --leak-check=full --show-leak-kinds=definite --error-exitcode=99 ./build/asan/leak_plain > /tmp/e01-valgrind.out 2>&1
    valgrind_rc=$?
    cat /tmp/e01-valgrind.out >> "$out"
    echo "valgrind_exit=$valgrind_rc (expect 99)" >> "$out"
    if ! grep -q "definitely lost" /tmp/e01-valgrind.out; then fail=1; fi
    if [ "$valgrind_rc" -ne 99 ]; then fail=1; fi
else
    echo "valgrind=SKIPPED" >> "$out"
fi

if [ "$fail" -eq 0 ]; then
    echo "SANITIZERS LINUX PASS" >> "$out"
else
    echo "ASAN LINUX FAIL" >> "$out"
fi
exit "$fail"
