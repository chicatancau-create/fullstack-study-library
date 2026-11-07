#!/usr/bin/env bash
# E06 证据采集：CPU profile、堆增长/释放、句柄泄漏、事件循环延迟。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence/cpu
rm -f evidence/cpu/*.cpuprofile

fails=0
fail() { echo "GATE FAIL: $*" >&2; fails=$((fails + 1)); }

{
  echo "captured_at: $(date -Is)"
  uname -a
  node -v
} > evidence/env.txt 2>&1

node --cpu-prof --cpu-prof-dir=evidence/cpu scenarios/cpu_loop.mjs > evidence/cpu_loop.txt 2>&1
rc=$?; echo "cpu exit=$rc"; [ "$rc" -eq 0 ] || fail "cpu_loop exit $rc"
profile=$(find evidence/cpu -name '*.cpuprofile' | head -1)
if [ -z "${profile:-}" ] || [ ! -s "$profile" ]; then
  fail "未生成 cpuprofile"
else
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!Array.isArray(p.nodes)||!Array.isArray(p.samples)||p.samples.length===0){process.exit(1)}" "$profile" \
    || fail "cpuprofile 无 nodes/samples"
  echo "profile: $profile bytes=$(wc -c < "$profile")"
fi

node --expose-gc scenarios/heap_growth.mjs > evidence/heap.txt 2>&1
rc=$?; echo "heap exit=$rc"; [ "$rc" -eq 0 ] || fail "heap exit $rc"

node scenarios/fd_leak.mjs > evidence/fd.txt 2>&1
rc=$?; echo "fd exit=$rc"; [ "$rc" -eq 0 ] || fail "fd exit $rc"

node scenarios/event_loop_delay.mjs > evidence/eventloop.txt 2>&1
rc=$?; echo "loop exit=$rc"; [ "$rc" -eq 0 ] || fail "loop exit $rc"

{
  echo "captured_at: $(date -Is)"
  echo "cpu: $(tail -1 evidence/cpu_loop.txt)"
  echo "profile: ${profile:-missing}"
  echo "heap: $(grep 'HEAP PASS' evidence/heap.txt || tail -1 evidence/heap.txt)"
  echo "fd: $(grep 'FD PASS' evidence/fd.txt || tail -1 evidence/fd.txt)"
  echo "loop: $(grep 'event_loop_delay' evidence/eventloop.txt | tail -1)"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"