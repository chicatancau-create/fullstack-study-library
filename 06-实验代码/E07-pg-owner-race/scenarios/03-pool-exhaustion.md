# 反例 03：连接池耗尽 + 长事务

## 症状

`max=10` 的池在高峰期请求全部卡在"等待可用连接"，接口超时；日志里没有慢 SQL，只有"timeout exceeded when trying to connect"。或者一个忘记提交的事务长期占着连接，池逐渐见底。

## 装置与实测

`src/tx.mjs` 的 `poolBehaviour()`：`max=2`、`connectionTimeoutMillis=300`。

```text
max=2 已获取=2
第 3 个获取: timeout（约 300ms）
长事务期间另一连接查询: ok=1
释放后 stats: total=2 idle=2 waiting=0
```

要点：

- 前两个连接被占满时，第三个 `pool.connect()` 在 300ms 后失败，而不是无限等待。
- 长事务只占 1 个连接，另一个连接仍能查询；耗尽来自"所有连接都被占"。
- 释放后 `idleCount` 回到 2，说明 `release()` 正常归还；若忘记 `release`，池会永久少一个。

## 修复

1. 为获取连接设置 `connectionTimeoutMillis`，失败快速返回，不要无限排队。
2. 事务代码用 `try/finally { client.release() }`；不要在手写 client 上执行 `BEGIN` 后忘记 `COMMIT/ROLLBACK`。
3. 事务内不做外部慢调用；需要时拆成"短事务 + 异步任务"。
4. 监控 `pool.totalCount/idleCount/waitingCount`，等待数持续 >0 就是容量或长事务信号。
5. 池大小按数据库连接上限与实例数分摊，不是越大越好。

## 常见误判

- 把池调到 100 解决超时：数据库 `max_connections` 与内存先被打满。
- 只加 `statement_timeout`：它杀 SQL，不回收忘记提交的事务；还要 `idle_in_transaction_session_timeout`。
- 连接泄漏时靠重启服务：根因是某条异常路径没 `release`。

## 自检

```bash
cd 06-实验代码/E07-pg-owner-race
cat evidence/pool.txt
```
