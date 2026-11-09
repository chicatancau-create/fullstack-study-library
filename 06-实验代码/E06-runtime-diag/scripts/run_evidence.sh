#!/usr/bin/env bash
# E06 证据采集：CPU 火焰图、堆快照对照、忙循环修复、单元测试。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence/heap evidence/flame
fails=0

# 1) 单测（src/ 的三个模块）
NO_COLOR=1 node --test tests/runtime.test.mjs > evidence/test.txt 2>&1
rc=$?; echo "test exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

# 2) 0x 火焰图（clinic flame 的底层实现）+ 热点摘要
rm -rf evidence/flame
NO_COLOR=1 node node_modules/0x/cmd.js --output-dir evidence/flame scenarios/cpu_loop.mjs > evidence/flame-run.txt 2>&1
rc=$?; echo "flame exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

# 3) --cpu-prof 原文件 + 热点函数摘要
rm -rf evidence/cpu
node --cpu-prof --cpu-prof-dir=evidence/cpu scenarios/cpu_loop.mjs > evidence/cpu_loop.txt 2>&1
rc=$?; echo "cpu-prof exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))
node -e "import('./src/profile.mjs').then(async ({ loadProfile, hotFunctions }) => { const fs = await import('node:fs'); const file = fs.readdirSync('evidence/cpu').find((f) => f.endsWith('.cpuprofile')); const top = hotFunctions(loadProfile('evidence/cpu/' + file), 5); fs.writeFileSync('evidence/cpu-hot.txt', ['profile=' + file, ...top.map((t) => \`\${t.selfMs}ms  \${t.name}  \${t.url}:\${t.line}\`)].join('\n') + '\n'); console.log(top[0]); });" > evidence/cpu-hot-run.txt 2>&1
rc=$?; echo "cpu-hot exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

# 4) 闭包泄漏：多轮堆趋势 + 泄漏/修复后快照与 retainer path
NO_COLOR=1 node --expose-gc scenarios/heap_leak.mjs > evidence/heap-leak.txt 2>&1
rc=$?; echo "heap exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

# 5) 忙循环：阻塞 vs setImmediate 分片 vs worker_threads
NO_COLOR=1 node scenarios/busy_fix.mjs > evidence/busy-fix.txt 2>&1
rc=$?; echo "busy exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "test: $(grep -E 'ℹ (pass|fail)' evidence/test.txt | tr '\n' ' ')"
  echo "flame: $(ls evidence/flame/flamegraph.html 2>/dev/null || echo missing)"
  echo "cpu-hot: $(head -2 evidence/cpu-hot.txt 2>/dev/null | tail -1)"
  echo "heap: $(grep '清理后' evidence/heap-leak.txt || true)"
  echo "busy: $(grep '阻塞' evidence/busy-fix.txt || true)"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
