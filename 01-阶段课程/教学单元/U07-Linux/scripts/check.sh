#!/usr/bin/env bash
# U07 可验证部分：在 Git Bash/MSYS 下检查路径、管道、进程、日志与资源命令。
# 这里不是 Linux 内核实验；Linux 权限/systemd/cgroup 的边界见 README。
set -uo pipefail

tmp="$(mktemp -d /tmp/u07.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

fails=0
checks=0
check() {
  local name="$1"
  shift
  checks=$((checks + 1))
  if "$@"; then
    echo "ok - $name"
  else
    echo "not ok - $name"
    fails=$((fails + 1))
  fi
}

echo "platform: $(uname -s) $(uname -r)"
echo "tmp: $tmp"
check "bash 可用" test -n "${BASH_VERSION:-}"

printf 'b\na\nc\n' > "$tmp/data file.txt"
count=$(find "$tmp" -type f -name '*.txt' -print0 | while IFS= read -r -d '' f; do printf '%s\n' "$f"; done | wc -l)
check "find -print0 处理空格文件名" test "$count" -eq 1

unique=$(printf 'b\na\nb\n' | sort -u | wc -l)
check "sort -u 去重" test "$unique" -eq 2

set +o pipefail
false | true
last_rc=$?
set -o pipefail
false | true
pipefail_rc=$?
set +o pipefail
check "默认管道取最后命令（0）" test "$last_rc" -eq 0
check "pipefail 暴露上游失败" test "$pipefail_rc" -ne 0

printf 'INFO ok\nERROR bad\n' > "$tmp/app.log"
errs=$(grep -c '^ERROR' "$tmp/app.log")
check "grep 统计错误日志" test "$errs" -eq 1

mode=$(ls -ld "$tmp/data file.txt" | awk '{print $1}')
check "ls -l 可读权限位" test -n "$mode"
echo "file_mode: ${mode:-unknown}"

sleep 30 &
pid=$!
check "后台进程存活" kill -0 "$pid"
kill "$pid" 2>/dev/null
wait "$pid" 2>/dev/null || true
if kill -0 "$pid" 2>/dev/null; then
  echo "not ok - 进程已终止"
  fails=$((fails + 1))
else
  echo "ok - 进程已终止"
fi
checks=$((checks + 1))

check "ulimit 可读" bash -c 'ulimit -n >/dev/null 2>&1'

echo "checks=$checks fails=$fails"
if [ "$fails" -ne 0 ]; then
  exit 1
fi
echo "U07 PARTIAL PASS（仅 Git Bash 可验证部分）"