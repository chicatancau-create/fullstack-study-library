# G7 中线技术栈与多语言交付

> 自学自测包。函数题（同契约对照）+ 真实 MySQL 8.4（隔离级别 / 行锁 / 死锁 / 乐观锁）。

## 两道子题

| 子题 | 位置 | 抓什么 |
| --- | --- | --- |
| 函数题 | `起始代码/index.mjs` → `compareContract` | 缺失/多余/不一致字段与兼容判定 |
| MySQL 实验 | `起始代码/db/mysql_lab.mjs` | 4 处真实缺陷：不切隔离级别、先查后改超卖、座位无行锁、假死锁 |
| JVM 死锁 | `jvm/Deadlock.java` | 真构造线程死锁，用 `ThreadMXBean.findDeadlockedThreads` 检测（实测 2 条） |

## 函数题

```bash
node 自测脚本/smoke.mjs
node 自测脚本/grade.mjs 起始代码/index.mjs
```

## MySQL 实验（真实 8.4 @3307）

只用 `g7_lab` 库（`stock` / `seat` 两张表）。

```bash
bash scripts/db_setup.sh
node 自测脚本/grade-mysql.mjs 起始代码/db/mysql_lab.mjs     # 目标 7/7
```

### 判据（`grade-mysql.mjs`）

| 编号 | 判据 | 抓的缺陷 |
| --- | --- | --- |
| M1 | `READ UNCOMMITTED` 下能脏读未提交值 | 不切隔离级别 |
| M2 | RR 内两次读一致；RC 内能看到已提交新值 | 级别没真正生效 |
| M3 | 10 并发订 5 件：成功 ≤5、库存不为负 | 先 `SELECT` 再 `UPDATE` |
| M4 | 10 并发同 version 的 CAS 只有 1 个赢 | 乐观锁缺 `AND version = ?` |
| M5 | 两个事务**并发**抢同一座位只有 1 人成功 | `SELECT` 缺 `FOR UPDATE` |
| M6 | 交叉加锁被 MySQL 检测（错误码 1213） | 顺序加锁不构成死锁 |

实测：答案 7/7；起始代码 6 条 fail。

> 为什么用行为验证隔离级别：MySQL 8 在事务内读 `@@transaction_isolation` 仍是全局值；读 `information_schema.innodb_trx` 需要 `PROCESS` 权限（本机 `study` 被拒）。用「READ UNCOMMITTED 能脏读」既不需要权限，也直接证明级别真的切了。

## 关键写法

- 切级别：`SET TRANSACTION ISOLATION LEVEL <level>` 必须是事务的第一条语句。
- 防超卖：`UPDATE ... WHERE available >= ?`，用 `affectedRows` 判失败。
- 行锁：`SELECT ... FOR UPDATE` + 同事务 `UPDATE`；不加锁时并发能双双成功。
- 死锁：交叉加锁（A: s2→s3，B: s3→s2），MySQL 必然回 1213，不是无限等待。

## 证据

`npm run evidence`：

- `evidence/judge-solution.txt` / `judge-starter.txt` —— 函数题
- `evidence/mysql-setup.txt` —— 建库、隔离级别、种子
- `evidence/mysql-solution.txt` / `mysql-starter.txt` —— 7 条
- `evidence/mutation.txt` —— 4 个注入缺陷全部被抓

## JVM 死锁诊断

```bash
cd jvm && javac -d "$TEMP/g7-jvm" Deadlock.java && java -cp "$TEMP/g7-jvm" Deadlock 3000
# 期望输出 deadlocked_threads=2
```

判据：轮询 `ThreadMXBean.findDeadlockedThreads()` 直到超时，返回 `ids.length`；`0` 即判失败。不是靠 `sleep` 猜耗时。

## 环境说明

- MySQL 8.4.13 @127.0.0.1:3307，库 `g7_lab`（已授予 `study` 全部权限）。
- JDK 25（`D:/JAVA/jdk`）可用于 JVM 题；`npm run evidence` 会自动编译并跑检测，无 `javac` 时写 SKIP。
- `mysql2` 3.x 装在包内；建库脚本用 mysql CLI，判分只用 Node 客户端。
- 没有 MySQL 时 `evidence.sh` 写 `SKIP` 并返回非 0，不伪造通过。

## 边界

- 不跑 Testcontainers（本机无 Docker；容器化 MySQL 的验证记录见 `04-资源与评估`）。
- JVM 线程死锁已实测（见上）；**JVM 堆/GC 诊断与 RabbitMQ 仍未实测**：容器化 RabbitMQ 未在本机启动，`rabbitmq-server` 只有安装目录没有运行服务。如实标注为未实测，不写成“已通过”。
- 本包为自学设计：起手代码故意做坏，不含隔离或防作弊。
