# U07 自测答案

1. **SIGTERM/SIGKILL**：SIGTERM 请求退出，进程可捕获并清理；SIGKILL 强制终止，不能捕获。先 SIGTERM 给清理机会，超时再 SIGKILL。
2. **PID 复用**：PID 数量有限，进程退出后会被新进程复用；杀之前用 `ps -p <pid> -o pid,args,lstart` 确认命令行与启动时间。
3. **-print0**：用 NUL 分隔文件名，避免空格/换行被拆；`for f in $(find ...)` 会按空白分词，文件名含空格就变成多个参数。
4. **管道退出码**：默认取最后一个命令，`false | true` 返回 0；`set -o pipefail` 让任一上游失败使整个管道非零。
5. **权限位**：Git Bash 的 `ls -l` 是 MSYS 模拟/映射，实际访问由 Windows ACL 决定；Linux 内核用 POSIX mode/ACL，行为不同，必须在 Linux 文件系统复验。

## 练习提示

- 基础 1：`sleep 60 &`、`ps -p $! -o pid,args`、`kill $!`、`wait $!`，记录退出码 143。
- 基础 2：`if [ ! -f "$log" ]; then echo ... >&2; exit 2; fi`；`grep -c` 无匹配返回 1，要显式处理。
- 边界 4：`grep -q pattern file; echo $?` 与 `grep -c`；区分 0/1/2（错误）。
- 边界 6：在 WSL/Linux 上 `chmod 600`、`stat -c '%a'`、用另一个用户读，记录差异。