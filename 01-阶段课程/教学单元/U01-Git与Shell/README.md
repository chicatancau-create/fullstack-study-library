# U01：Git 与 Shell

> 前置：会打开终端、知道当前目录与相对路径。不需要 Git 基础。
>
> 本单元是自包含教学，不依赖 `05-外部资料库`。示例在临时目录运行，不修改学习库。

## 1. 目标 / 非目标 / 产出

**目标**

- 理解工作区、暂存区、提交图、分支指针四者的关系。
- 能独立完成 init → add → commit → branch → merge → 解决冲突 → 回到分支。
- 能解释 Shell 管道的退出码，不被“最后一条命令成功”骗过。

**非目标**

- 不教 rebase/cherry-pick 的高级策略，不教 Git 内部对象格式的完整实现。
- 不把“会敲命令”当作协作能力；团队评审、交接仍须真实记录。
- 不在本单元练算法或数据库。

**产出**

- 能运行 [examples/demo.sh](examples/demo.sh) 并读懂输出。
- 完成 [练习](#8-练习) 与 [盲测](blind/README.md)，答案在 [answers](answers/README.md)，先做再看。

## 2. 心智模型

Git 管理的是**提交图**，不是“文件夹的当前样子”。工作区是你看到的文件；暂存区（index）是下一次提交的候选快照；提交是图上的一个节点，记录父节点、作者、时间和整棵树的快照。分支只是一个**指向某个提交的可移动指针**，`HEAD` 指向当前分支（或直接指向某个提交，即 detached HEAD）。

合并时，Git 找两个分支的最近共同祖先，把两边的改动合到一起。若同一文件的同一区域被两边改成不同内容，Git 不会猜，而是把冲突写进文件，让你决定。冲突标记不是最终内容；必须解决、`git add`、再 `git commit`。

Shell 管道 `a | b` 的退出码默认取**最后一个命令** `b`。所以 `false | true` 会返回 0；要发现上游失败，用 `set -o pipefail` 或读 `${PIPESTATUS[@]}`。

## 3. 讲义

### 3.1 三棵树与一次提交

```bash
git status            # 工作区 vs 暂存区 vs HEAD
git add a.txt         # 把工作区内容写入暂存区
git commit -m "..."   # 把暂存区写成提交，HEAD 前移
git log --oneline --graph --decorate
```

`git add` 不是“保存文件”，而是“把当前内容放进下一次提交的候选快照”。`git commit` 之后，工作区不会自动同步其他文件；没 `add` 的改动仍在工作区。

### 3.2 分支与合并

```bash
git branch feature        # 创建指针，不切换
git checkout feature      # 切换分支（HEAD 指向 feature）
git merge feature         # 把 feature 合并进当前分支
```

`git checkout -b feature` 等于“创建 + 切换”。合并成功后 Git 可能做 fast-forward（只移动指针）或产生 merge commit（两个父节点）。有冲突时先解决，再 `git add` 和 `git commit`。

### 3.3 冲突长什么样

```text
<<<<<<< HEAD
main 的版本
=======
feature 的版本
>>>>>>> feature
```

三行标记都是**要删除的脚手架**。保留你想要的内容（或手动合并），删掉 `<<<<<<<`、`=======`、`>>>>>>>`，然后 `git add` 标记为已解决。

### 3.4 detached HEAD

`git checkout <commit>` 会让 HEAD 直接指向提交，而不是分支。此时新提交不属于任何分支，切走后容易“丢失”（仍可通过 reflog 找回）。实验或查看历史可以这样做；要保留改动，先 `git switch -c new-branch`。

### 3.5 Shell 管道与退出码

```bash
false | true; echo $?          # 0：只看最后一个命令
set -o pipefail
false | true; echo $?          # 1：上游失败也暴露
printf 'a\nb\n\nc\n' | grep -c .   # 3：统计非空行
```

管道里的每个命令都在子 shell 中运行；变量赋值、`cd` 不会影响父 shell。需要当前 shell 生效时用 `source` 或 `$(...)` 取输出。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U01-Git与Shell
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状，精确提交号以证据为准）：

```text
[步骤 1] 初始提交
  base=xxxxxxx
[步骤 2] feature 分支修改同一行
[步骤 3] main 分支也修改同一行
[步骤 4] 合并 feature，预期冲突
  merge_exit=1（非 0 表示冲突，符合预期）
  冲突标记已出现
[步骤 5] 解决冲突并提交
  commit_count=4（初始 + feature + main + merge = 4）
[步骤 6] detached HEAD 与回到分支
  detached HEAD：symbolic-ref 失败，符合预期
[步骤 7] 管道退出码
  默认取最后一个命令: false|true -> 0；pipefail: -> 1
[步骤 8] 文本管线：统计非空行
  非空行数=3
DEMO PASS
exit=0
```

如果输出不是 `DEMO PASS`，按下一节的错误表定位；不要改断言来“通过”。

## 5. 常见错误

### 错误 1：`fatal: not a git repository`

- 现象：在错误目录执行 `git status`。
- 定位：`pwd`、`ls -a`，看是否有 `.git`；`git rev-parse --show-toplevel`。
- 修复：`cd` 到仓库根目录，或用 `git -C <path>`。
- 回归：`git status` 能正常显示分支。

### 错误 2：把冲突标记提交了

- 现象：代码里出现 `<<<<<<<`，程序语法错误。
- 定位：`git grep -n '<<<<<<<'`；`git status` 看 unmerged 文件。
- 修复：编辑文件删掉三行标记，保留正确内容，`git add`，`git commit`。
- 回归：`git grep -n '<<<<<<<'` 无输出，测试通过。

### 错误 3：`git add -A` 吞掉无关改动

- 现象：提交里混入别人的 WIP、临时文件或秘密。
- 定位：`git status --short`、`git diff --cached --stat`。
- 修复：`git restore --staged <path>` 取消暂存；只 `git add` 明确路径。
- 回归：提交前逐项核对 `git diff --cached`。

### 错误 4：`false | true` 返回 0

- 现象：脚本明明失败，CI 却绿。
- 定位：`echo $?` 与 `${PIPESTATUS[@]}`。
- 修复：`set -o pipefail`，或逐个检查 `PIPESTATUS`。
- 回归：故意让上游失败，脚本必须非零。

### 错误 5：用 `git checkout .` “清理”

- 现象：未提交的改动被永久丢弃。
- 定位：`git status` 先看有什么；`git diff` 看内容。
- 修复：先 `git stash push -u` 或提交到临时分支；确认后再恢复。
- 回归：`git stash list` 能看到暂存项。

## 6. 练习

### 基础

1. 在临时目录初始化仓库，做两次提交，用 `git log --oneline` 证明父链。
2. 创建 `feature` 分支，修改同一行，合并回 `main`，解决冲突。
3. 用 `git status --short` 区分“已暂存/未暂存/未跟踪”三种状态。

### 边界

4. 在空仓库执行 `git log` 会发生什么？如何让脚本在这种情况下不崩？
5. 文件名含空格时，`git add` 与 `for f in $(git ls-files)` 各有什么问题？给出安全写法。
6. 在 detached HEAD 上提交，再切回 `main`；用 `git reflog` 找回那次提交。

## 7. 自测

1. 工作区、暂存区、提交图的区别是什么？
2. 分支是什么？`HEAD` 是什么？
3. 合并冲突时，三行标记分别代表什么？为什么不能直接提交？
4. `false | true` 的退出码是多少？怎样让脚本发现上游失败？
5. detached HEAD 上提交后切走，如何找回？

答案见 [answers/README.md](answers/README.md)。先独立作答，再对照。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。该任务不附答案，要求在一台干净目录中独立完成，并保留命令输出。不得把本单元示例原样复制后声称独立完成。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M01 编程与算法 | 部分 | 提交图、状态迁移、边界与脚本退出码 |
| M09 测试与调试 | 部分 | 用 `git status/diff/log` 定位，用断言验证冲突与历史 |
| M14 协作与接手 | 部分 | 分支、合并、冲突解决是协作基础；真实评审/交接不在本单元 |
| G0 | 环境与习惯 | 只覆盖 Git/终端基础，不代表 G0 通过 |
| G1 | 不覆盖 | G1 的网络/键盘/内存证据见 E04、G1 站点、E01 |

## 10. 官方资料与查阅日期

- [Pro Git 中文版](https://git-scm.com/book/zh/v2)：2026-11-07 查阅。
- [Git 命令参考](https://git-scm.com/docs)：2026-11-07 查阅。
- [GNU Bash 手册](https://www.gnu.org/software/bash/manual/bash.html)：2026-11-07 查阅。
- 版本边界：示例在 Git for Windows + Git Bash 实测；其他 shell/版本的行为可能不同，未跨平台复测。

## 11. 证据

- `evidence/run.txt`：示例原始输出与退出码。
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256。
- 重新生成：`bash scripts/run_unit.sh`，再用 `_template/manifest.mjs` 生成 manifest。