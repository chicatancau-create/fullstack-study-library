#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p evidence

# 1) 单函数题：答案通过、起始代码被拒绝
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

# 2) 固定 fixture 仓库练习：从 bare clone → 未修必须先失败 → 参考答案修复后必须通过
FIXTURE_DIR="${TMPDIR:-/tmp}/g0-fixture-evidence"
rm -rf "$FIXTURE_DIR"
node fixture/build.mjs "$FIXTURE_DIR" > evidence/fixture-build.txt
{
  echo "bare=$(node -e "console.log(JSON.parse(require('fs').readFileSync('evidence/fixture-build.txt','utf8')).bare)")"
} > evidence/fixture-paths.txt

CLEAN_CLONE="$FIXTURE_DIR/learner"
git clone -q "$FIXTURE_DIR/legacy.bare.git" "$CLEAN_CLONE"
git -C "$CLEAN_CLONE" -c user.name=Learner -c user.email=learner@example.test checkout -q main

# 2a) 未修状态必须被拒
set +e
node 自测脚本/grade-repo.mjs "$CLEAN_CLONE" > evidence/fixture-unsolved.txt 2>&1
unsolved_rc=$?
set -e
if [ "$unsolved_rc" -eq 0 ]; then
  echo "未修 fixture 不应通过 grade-repo" >&2
  exit 1
fi
echo "unsolved_rejected=YES rc=$unsolved_rc" | tee -a evidence/fixture-unsolved.txt

# 2b) 干净 clone 后秘密文件不存在（.gitignore 生效）——这是“干净 clone”的实证
if [ -f "$CLEAN_CLONE/config/local.env" ]; then
  echo "干净 clone 里不应出现被忽略的 config/local.env" | tee evidence/fixture-secret.txt >&2
  exit 1
fi
echo "clean_clone_no_secret=YES" | tee evidence/fixture-secret.txt

# 2c) 参考答案修复后必须通过
node 参考答案/solve-repo.mjs "$CLEAN_CLONE" > evidence/fixture-solve.json
node 自测脚本/grade-repo.mjs "$CLEAN_CLONE" | tee evidence/fixture-solved.txt

# 3) 自测脚本自身的有效性：注入受控缺陷必须被抓到
node scripts/mutation_check.mjs | tee evidence/mutation.txt

echo "SELF-TEST PASS"
