#!/usr/bin/env bash
# U01 最小可运行示例：提交图、分支、合并冲突、detached HEAD、管道退出码。
# 全部在 mktemp 临时目录内执行，不触碰学习库本身。
set -uo pipefail

tmp=$(mktemp -d)
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

cd "$tmp"
git init -q
git symbolic-ref HEAD refs/heads/main
git config user.email "demo@example.invalid"
git config user.name "U01 Demo"
git config core.autocrlf false

echo "[步骤 1] 初始提交"
printf 'line1\n' > a.txt
git add a.txt
git commit -qm "add a"
base=$(git rev-parse --short HEAD)
echo "  base=$base"

echo "[步骤 2] feature 分支修改同一行"
git checkout -qb feature
printf 'line1\nfeature\n' > a.txt
git commit -qam "feature change"

echo "[步骤 3] main 分支也修改同一行"
git checkout -q main
printf 'line1\nmain\n' > a.txt
git commit -qam "main change"

echo "[步骤 4] 合并 feature，预期冲突"
set +e
git merge feature > merge.out 2>&1
merge_rc=$?
set -e
echo "  merge_exit=$merge_rc（非 0 表示冲突，符合预期）"
[ "$merge_rc" -ne 0 ] || { echo "DEMO FAIL: 合并未冲突"; exit 1; }
grep -q '<<<<<<<' a.txt || { echo "DEMO FAIL: 没有冲突标记"; exit 1; }
echo "  冲突标记已出现"
rm -f merge.out

echo "[步骤 5] 解决冲突并提交"
printf 'line1\nresolved\n' > a.txt
git add a.txt
git commit -qm "resolve conflict"
count=$(git rev-list --count HEAD)
echo "  commit_count=$count（初始 + feature + main + merge = 4）"
[ "$count" -eq 4 ] || { echo "DEMO FAIL: 提交数 $count"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "DEMO FAIL: 工作区不干净"; exit 1; }

echo "[步骤 6] detached HEAD 与回到分支"
git checkout -q --detach HEAD~1
if git symbolic-ref -q HEAD >/dev/null; then
    echo "DEMO FAIL: 预期 detached HEAD"
    exit 1
fi
echo "  detached HEAD：symbolic-ref 失败，符合预期"
git checkout -q main
[ "$(git symbolic-ref --short HEAD)" = "main" ] || { echo "DEMO FAIL: 未回到 main"; exit 1; }

echo "[步骤 7] 管道退出码"
set +o pipefail
set +e
false | true
last_rc=$?
set -o pipefail
false | true
pipefail_rc=$?
set +o pipefail
set -e
echo "  默认取最后一个命令: false|true -> $last_rc；pipefail: -> $pipefail_rc"
[ "$last_rc" -eq 0 ] || { echo "DEMO FAIL: 默认管道退出码应为 0"; exit 1; }
[ "$pipefail_rc" -ne 0 ] || { echo "DEMO FAIL: pipefail 应暴露失败"; exit 1; }

echo "[步骤 8] 文本管线：统计非空行"
n=$(printf 'a\nb\n\nc\n' | grep -c .)
echo "  非空行数=$n"
[ "$n" -eq 3 ] || { echo "DEMO FAIL: 非空行数应为 3"; exit 1; }

echo "DEMO PASS"