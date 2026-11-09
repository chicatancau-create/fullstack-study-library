# 场景 03：改类型不是“执行一下”，是一段锁窗口

## 触发条件

`metrics.value` 为 integer，5 万行。一个事务持有该行/表锁，另一个会话执行 `ALTER COLUMN TYPE bigint`。

## 观察到的现象

- ALTER 需要 `AccessExclusiveLock`；持锁事务未提交时，观察者在 `pg_locks` 看到 `granted=false` 的 `AccessExclusiveLock`，等待事件是 `Lock/relation`。
- 持锁期间并发写入语句排在 ALTER 之后（最大等待 154.7ms），但 11 次尝试 0 失败。
- 释放后 ALTER 约 180ms 完成，`data_type=bigint`，5 万行不变。
- 第二次持锁不放并把 `lock_timeout` 设为 200ms，ALTER 以 `55P03` 失败退出，而不是无限阻塞。

## 判读

- `evidence/type-change.txt` 要同时有 `mode=AccessExclusiveLock`、`failed=0`、`55P03`。
- 只有 `TYPE PASS` 没有等待模式，等于没量到锁。

## 边界

本机回环、单表 5 万行；未测大表重写时长、复制槽延迟、DDL 期间的连接池耗尽。
