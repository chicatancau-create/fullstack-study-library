#!/usr/bin/env bash
# E05 证据采集：类型检查、测试、生产构建、SSR、缓存。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

if [ ! -d node_modules/vite ]; then
  npm ci --no-audit --no-fund
fi

export E05_SECRET="do-not-ship-this-secret"
fails=0
NO_COLOR=1 npx tsc --noEmit > evidence/typecheck.txt 2>&1
rc=$?; echo "typecheck exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

NO_COLOR=1 npx vitest run > evidence/test.txt 2>&1
rc=$?; echo "test exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

NO_COLOR=1 npx vite build > evidence/build.txt 2>&1
rc=$?; echo "build exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

NO_COLOR=1 npx tsx scripts/render.tsx > evidence/ssr-run.txt 2>&1
rc=$?; echo "ssr exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

node scripts/inspect-build.mjs > evidence/inspect.txt 2>&1
rc=$?; echo "inspect exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

node scripts/serve-check.mjs > evidence/cache-run.txt 2>&1
rc=$?; echo "cache exit=$rc"; [ "$rc" -eq 0 ] || fails=$((fails + 1))

{
  echo "captured_at: $(date -Is)"
  echo "typecheck: $(grep -c 'error TS' evidence/typecheck.txt) errors"
  echo "test: $(grep -E 'Tests|Test Files' evidence/test.txt | tr '\n' ' ')"
  echo "build: $(grep -E 'built in|modules transformed' evidence/build.txt | tail -1)"
  echo "ssr: $(tail -1 evidence/ssr-run.txt)"
  echo "inspect: $(tail -1 evidence/inspect.txt)"
  echo "cache: $(grep 'CACHE PASS' evidence/cache-run.txt || true)"
  echo "gate_failures: $fails"
} | tee evidence/run.txt

exit "$fails"
