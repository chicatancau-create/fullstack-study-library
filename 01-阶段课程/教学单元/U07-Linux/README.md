# U07：Linux / Shell 诊断基础（Git Bash 可验证部分）

> 前置：完成 U01。本单元在 Windows 的 Git Bash/MSYS 下运行；**不是 Linux 内核实验**。
>
> 本机没有 WSL 发行版，因此权限、systemd、cgroup、真实网络命名空间等未验证；边界见第 9 节。

## 1. 目标 / 非目标 / 产出

**目标**

- 用 `ps`/`kill` 观察与终止进程；知道信号与 PID 复用风险。
- 用 `ls -l`/`stat` 读权限位与文件元数据；知道 Windows ACL 与 POSIX mode 的差异。
- 用 `find -print0`、`grep`、`sort -u`、重定向与管道处理日志；不被空格/退出码坑。
- 用 `ulimit` 看资源限制；知道端口/日志诊断的基本顺序。
- 明确“本机通过”不等于“Linux 生产通过”。

**非目标**

- 不做 systemd/服务管理、cgroup、iptables/nftables、SELinux/AppArmor。
- 不做真实 Linux 内核/文件系统/网络命名空间实验。
- 不把 MSYS 的 `kill`/权限行为当作 Linux 语义。

**产出**

- 运行 10 条 Git Bash 检查。
- 完成练习、自测与 [盲测](blind/README.md)；答案在 [answers](README.md)。

## 2. 心智模型

进程是运行中的程序，拥有 PID、父进程、文件描述符、环境变量与资源限制。信号是异步通知：`SIGTERM` 请求退出，`SIGKILL` 强制；进程可以捕获前者，不能捕获后者。PID 会被复用，杀进程前先确认命令行，不要只凭 PID。

权限位分用户/组/其他三组（rwx）；执行/读写检查由内核完成。Windows 用 ACL，Git Bash 显示的 `-rw-r--r--` 是 MSYS 模拟，不等于 Linux 内核权限。端口是进程持有的资源；`ss`/`lsof` 能看谁在监听，Windows 下工具不同。

诊断顺序：先看进程是否活着/在跑什么 → 看端口/文件/句柄 → 看日志与退出码 → 再看资源限制/磁盘/网络。不要一上来重启。

## 3. 讲义

### 3.1 进程与信号

```bash
sleep 30 &
pid=$!
ps -p "$pid" -o pid,comm,args
kill "$pid"        # SIGTERM
wait "$pid" || true
```

`kill -0` 只检查进程是否存在，不发信号。`kill -9` 是最后手段，可能留下半写文件/未释放资源。杀之前用 `ps -p <pid> -o args=` 确认命令行。

### 3.2 权限与元数据

```bash
ls -ld "data file.txt"
stat -c '%a %U %G %s' "data file.txt"
```

`-rw-r--r--` 表示所有者读写、组/其他只读。MSYS 下 `chmod` 可能不改变 Windows ACL；真正的 Linux 权限需在 Linux 文件系统上验证。

### 3.3 文件与日志

```bash
find . -type f -name '*.log' -print0 | while IFS= read -r -d '' f; do
  printf '%s\n' "$f"
done
grep -c '^ERROR' app.log
sort -u names.txt | wc -l
```

`-print0` + `read -d ''` 处理空格/换行文件名；`for f in $(find ...)` 会被空格拆开。`grep -c` 无匹配时退出码 1，脚本要区分“0 条”和“命令失败”。

### 3.4 管道与退出码

```bash
false | true; echo $?          # 0
set -o pipefail
false | true; echo $?          # 1
```

默认只看最后一个命令；`pipefail` 让上游失败也暴露。日志脚本必须检查退出码，不能只打印。

### 3.5 资源与端口

```bash
ulimit -n          # 打开文件描述符上限
ps aux | head
# Linux: ss -ltnp | grep :8080
# Windows: netstat -ano | findstr :8080
```

端口被占用时先确认进程命令行与归属，不要直接杀陌生进程；`netstat`/`ss` 的输出可能因权限/实现不同而缺失。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U07-Linux
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状）：

```text
platform: MINGW64_NT-...
ok - find -print0 处理空格文件名
ok - 默认管道取最后命令（0）
ok - pipefail 暴露上游失败
ok - 后台进程存活
ok - 进程已终止
ok - ls -l 可读权限位
checks=10 fails=0
U07 PARTIAL PASS（仅 Git Bash 可验证部分）
exit=0
```

实际输出见 `evidence/run.txt`；平台行会明确显示 MINGW64，不是 Linux。

## 5. 常见错误

### 错误 1：用 PID 直接杀进程

- 现象：PID 复用，杀错服务。
- 定位：`ps -p <pid> -o pid,args`；确认命令行/启动时间。
- 修复：按命令行/端口定位，再杀；优先 SIGTERM。
- 回归：进程消失、端口释放、日志无异常。

### 错误 2：`for f in $(find ...)`

- 现象：文件名含空格/换行被拆成多个参数。
- 定位：打印 `$f`；用 `-print0`。
- 修复：`find -print0 | while IFS= read -r -d '' f`。
- 回归：含空格文件只处理一次。

### 错误 3：忽略 `grep -c` 的退出码

- 现象：0 条匹配被当成命令失败，或失败被当成 0 条。
- 定位：`echo $?`。
- 修复：区分 `grep -q`/计数；允许无匹配时显式处理。
- 回归：0 条与错误输入两种测试。

### 错误 4：把 MSYS 权限当 Linux 权限

- 现象：本机 `chmod` 成功，Linux 上仍不可读/不可执行。
- 定位：目标文件系统与 ACL；`getfacl`/`stat`。
- 修复：在 Linux 环境验证；部署脚本显式 `chmod`/`chown`。
- 回归：Linux 上按目标用户复验。

### 错误 5：端口占用就重启

- 现象：重启后仍冲突，或杀掉别人的进程。
- 定位：`ss -ltnp`/`netstat -ano` + 进程命令行。
- 修复：确认归属；改端口/优雅停止；不要盲杀。
- 回归：端口释放，服务正常启动。

## 6. 练习

### 基础

1. 启动 `sleep 60`，用 `ps` 确认命令行，SIGTERM 终止并检查退出码。
2. 写脚本统计日志中 ERROR 行数，文件不存在时退出码非 0。
3. 用 `find -print0` 处理带空格文件名，输出数量。

### 边界

4. 构造 `grep` 无匹配，分别用 `-q` 与 `-c`，记录退出码。
5. 用 `ulimit -n` 看限制，说明达到上限时会发生什么（不实际打满）。
6. 在 Linux/WSL 上复验权限位与 `chmod`，对比 Git Bash 结果。

## 7. 自测

1. SIGTERM 与 SIGKILL 的区别？为什么先 SIGTERM？
2. PID 为什么会复用？杀进程前要确认什么？
3. `-print0` 解决什么问题？`for f in $(find ...)` 为什么危险？
4. `false | true` 的退出码？`pipefail` 改变什么？
5. 为什么 Git Bash 的权限位不能代表 Linux 内核权限？

答案见 [answers/README.md](answers/README.md)。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。要求在真实 Linux/WSL 上做进程/端口/日志诊断；不附答案。

## 9. 边界

- 本机 `uname` 为 `MINGW64_NT`，不是 Linux；没有 WSL 发行版。
- 未验证 systemd、cgroup、iptables/nftables、SELinux/AppArmor、真实 POSIX 权限。
- `kill`/`chmod`/`ulimit` 的 MSYS 行为与 Linux 不同；不能外推。
- 端口诊断只用通用命令说明，未在本机做真实端口冲突实验（避免杀陌生进程）。

## 10. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M02 系统与网络 | 部分 | 进程/信号/文件/管道/资源；无 Linux 内核 |
| M12 发布与可靠性 | 部分 | 诊断顺序与日志；无服务管理/容器 |
| E06 | 参考 | 真实 OS 诊断实验未做 |
| G5 | 不覆盖 | 无故障注入/恢复演练 |

## 11. 官方资料与查阅日期

- [Linux man-pages](https://www.kernel.org/doc/man-pages/)：2026-11-07 查阅。
- [GNU Coreutils](https://www.gnu.org/software/coreutils/manual/)：2026-11-07 查阅。
- [GNU Bash 手册](https://www.gnu.org/software/bash/manual/bash.html)：2026-11-07 查阅。
- 版本边界：Git Bash/MSYS 3.6.5；不是 Linux 发行版。

## 12. 证据

- `evidence/run.txt`：10 条检查、平台行与退出码。
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256。