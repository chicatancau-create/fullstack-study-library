#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
if [ -z "${PGPASSWORD:-}" ]; then echo "需要 PGPASSWORD" >&2; exit 2; fi
if [ ! -d node_modules/pg ]; then npm install --no-audit --no-fund; fi
mkdir -p evidence
fails=0
node evaluate.mjs 2>&1 | tee evidence/eval.txt
rc=${PIPESTATUS[0]}; [ "$rc" -eq 0 ] || fails=$((fails + 1))
exit "$fails"
