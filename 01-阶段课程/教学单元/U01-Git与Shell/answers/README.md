# U01 自测答案

> 先独立作答，再对照。答案只覆盖本单元，不替代真实仓库演练。

1. **工作区 / 暂存区 / 提交图**：工作区是磁盘上当前文件；暂存区是下一次提交的候选快照；提交图是已提交节点及其父链。`git add` 把工作区内容写入暂存区，`git commit` 把暂存区写成新节点并移动 `HEAD`。
2. **分支 / HEAD**：分支是指向某个提交的可移动指针；`HEAD` 指向当前分支（正常）或直接指向某个提交（detached HEAD）。切换分支就是移动 `HEAD` 并更新工作区。
3. **冲突标记**：`<<<<<<< HEAD` 到 `=======` 是当前分支版本，`=======` 到 `>>>>>>> feature` 是另一分支版本。标记只是提示，不是合法内容；直接提交会把标记留在文件里，导致语法/运行错误。
4. **管道退出码**：默认取最后一个命令，`false | true` 返回 0。用 `set -o pipefail` 让上游失败也变成非零，或读 `${PIPESTATUS[@]}` 逐个判断。
5. **detached HEAD 找回**：`git reflog` 找到那次提交的 SHA，`git switch -c rescue <sha>` 或 `git branch rescue <sha>` 把它挂回分支。不要依赖“切走就没了”的记忆，reflog 有保留期，仍应尽快处理。

## 练习提示（不是完整答案）

- 基础 1–3：用 `git log --oneline --graph --decorate` 和 `git status --short` 留下输出；不要只看命令成功。
- 边界 4：空仓库 `git log` 退出码非 0；脚本里先判断 `git rev-parse --verify HEAD`，或允许 `git log` 失败并给出空历史提示。
- 边界 5：`git add -- "path with space.txt"`；遍历用 `git ls-files -z | while IFS= read -r -d '' f; do ...; done`，不要 `for f in $(...)`。
- 边界 6：`git reflog`、`git branch rescue <sha>`，再核对 `git log rescue`。