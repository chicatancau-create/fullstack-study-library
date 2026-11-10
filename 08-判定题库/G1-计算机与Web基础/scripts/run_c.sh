#!/usr/bin/env bash
# G1 C 题实测：编译 + 运行探针。不用 ASan（本机 MinGW 无 -lasan），
# 改用 -fsanitize=undefined 不可用时退化为 -Werror + 探针返回码判据。
# 用法：bash scripts/run_c.sh <ring_buffer.c 路径> <输出目录>
set -uo pipefail
SRC="${1:?用法: run_c.sh <ring_buffer.c> <outdir>}"
OUT="${2:-${TMPDIR:-/tmp}/g1-c}"
INC_H="$(cd "$(dirname "$SRC")" && pwd)"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PROBE="$HERE/自测脚本/c_probe.c"
mkdir -p "$OUT"

if ! command -v gcc >/dev/null 2>&1; then
  echo "C-SKIP: 本机没有 gcc，C 题未实测"
  exit 0
fi

echo "compiler: $(gcc --version | head -1)"
if gcc -std=c11 -O2 -Wall -Wextra -Werror -I "$INC_H" -I "$HERE/自测脚本" -o "$OUT/probe.exe" "$PROBE" "$SRC" 2>"$OUT/build.log"; then
  echo "build: OK（-Wall -Wextra -Werror 零警告）"
else
  echo "build: FAIL"
  cat "$OUT/build.log"
  exit 1
fi

set +e
"$OUT/probe.exe"
rc=$?
set -e
case "$rc" in
  0) echo "probe: PASS（满时拒绝 + 负索引拒绝 + 边界参数都对）" ;;
  2) echo "probe: FAIL(2) 满时越界写，len 超过 cap" ;;
  3) echo "probe: FAIL(3) 负索引未被拒" ;;
  5) echo "probe: FAIL(5) 正常 push 失败" ;;
  6) echo "probe: FAIL(6) 读取值不符" ;;
  7) echo "probe: FAIL(7) rb_new(0) 没返回 NULL" ;;
  *) echo "probe: FAIL($rc)" ;;
esac
echo "probe_rc=$rc"
exit "$rc"
