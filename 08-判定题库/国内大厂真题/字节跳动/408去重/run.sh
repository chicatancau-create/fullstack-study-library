#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p evidence
node build_ledger.mjs 2>&1 | tee evidence/run.txt
rc=${PIPESTATUS[0]}
{
  echo "captured_at: $(date -Is)"
  echo "node: $(node -v)"
  echo "summary: $(node -e "const s=require('./summary.json'); console.log(JSON.stringify(s.five_counts))")"
} | tee -a evidence/run.txt
exit "$rc"
