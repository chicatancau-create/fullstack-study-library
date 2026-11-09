#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

# 1. JS 版本：答案必须通过、起始代码必须被拒绝
node 自测脚本/grade.mjs 参考答案/index.mjs | tee evidence/judge-solution.txt
set +e
node 自测脚本/grade.mjs 起始代码/index.mjs > evidence/judge-starter.txt 2>&1
rc=$?
set -e
if [ "$rc" -eq 0 ]; then
  echo "起始代码不应通过自测脚本" >&2
  exit 1
fi
echo "starter_rejected=YES rc=$rc" | tee -a evidence/judge-starter.txt

# 2. TS 版本：完整断言（并发/队列/取消/边界）+ 起始代码被拒绝
node 自测脚本/grade-ts.mjs 参考答案/ts/pool.ts | tee evidence/ts-solution.txt
set +e
node 自测脚本/grade-ts.mjs 起始代码/ts/pool.ts > evidence/ts-starter.txt 2>&1
ts_rc=$?
set -e
if [ "$ts_rc" -eq 0 ]; then
  echo "TS 起始代码不应通过自测脚本" >&2
  exit 1
fi
echo "ts_starter_rejected=YES rc=$ts_rc" | tee -a evidence/ts-starter.txt

# 3. CLI：参数/退出码/schema/队列满/取消
node 自测脚本/grade-cli.mjs | tee evidence/cli-acceptance.txt

# 4. 自测脚本自身的有效性：注入 4 个受控缺陷，必须全部被抓到
node scripts/mutation_check.mjs | tee evidence/mutation.txt

# 5. 类型门禁：tsc 零错误 + 类型覆盖率 ≥80%
npx tsc -p tsconfig.json | tee evidence/typecheck.txt
npx type-coverage --project tsconfig.json --at-least 80 --detail 2>&1 | tail -5 | tee evidence/type-coverage.txt

echo "SELF-TEST PASS"
