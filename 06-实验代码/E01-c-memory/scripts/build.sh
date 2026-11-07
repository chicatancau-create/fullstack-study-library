#!/usr/bin/env bash
# E01 构建脚本。默认 gcc（MinGW-w64）。产物放 build/，不进 Git。
set -euo pipefail

cd "$(dirname "$0")/.."

CC="${CC:-gcc}"
CFLAGS=(-std=c17 -Wall -Wextra -Wpedantic -g -O0 -I src)
OUT=build
mkdir -p "$OUT"

echo "[build] compiler: $($CC --version | head -1)"
echo "[build] flags:    ${CFLAGS[*]}"

# shellcheck disable=SC2086
"$CC" "${CFLAGS[@]}" \
    src/dynarray.c src/alloc.c tests/test_dynarray.c \
    -o "$OUT/test_dynarray.exe"
echo "[build] $OUT/test_dynarray.exe"

"$CC" "${CFLAGS[@]}" \
    src/hashmap.c src/alloc.c tests/test_hashmap.c \
    -o "$OUT/test_hashmap.exe"
echo "[build] $OUT/test_hashmap.exe"

"$CC" "${CFLAGS[@]}" -DGUARD_PAGE tests/fault_guard.c -o "$OUT/fault_guard.exe"
echo "[build] $OUT/fault_guard.exe        (注入版：预期越界崩溃)"

"$CC" "${CFLAGS[@]}" -DGUARD_PAGE -DFIXED_BOUNDS tests/fault_guard.c \
    -o "$OUT/fault_guard_fixed.exe"
echo "[build] $OUT/fault_guard_fixed.exe  (修复版：预期拒绝越界)"

"$CC" "${CFLAGS[@]}" tests/fault_plain.c -o "$OUT/fault_plain.exe"
echo "[build] $OUT/fault_plain.exe        (对照组：普通堆，预期静默不崩)"

"$CC" "${CFLAGS[@]}" -DUAF_ACCESS tests/fault_uaf.c -o "$OUT/fault_uaf.exe"
echo "[build] $OUT/fault_uaf.exe          (UAF 注入：预期 SIGSEGV)"

"$CC" "${CFLAGS[@]}" tests/fault_uaf.c -o "$OUT/fault_uaf_fixed.exe"
echo "[build] $OUT/fault_uaf_fixed.exe    (UAF 修复：预期 exit 0)"

echo "[build] done"
