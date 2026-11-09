# 反例 02：两个事务反向加锁 → 40P01

## 症状

两个并发事务都更新 `inventory` 的 x、y 两行，但顺序相反：A 先 x 后 y，B 先 y 后 x。双方各持一把锁等对方，PostgreSQL 在 `deadlock_timeout`（默认 1s）后检测到环，回滚其中一个，报 `40P01 deadlock detected`。

## 装置与实测

`src/tx.mjs` 的 `deadlock({ reversed: true })`：c1 锁 x、c2 锁 y，随后 c1 更新 y、c2 更新 x。等待窗口内用第三个连接查 `pg_locks`：

```text
错误码: 40P01
未授予锁 2 条:
  pid=64132 lock=transactionid/ShareLock
  pid=24544 lock=transactionid/ShareLock
```

行锁在等待时表现为 `transactionid/ShareLock`（relation 为空），所以过滤条件必须允许 `relation IS NULL`，只按 `e07` 命名空间过滤会漏掉。

## 修复

统一加锁顺序：所有事务按同一业务顺序（如按 sku 排序）更新；实测 `consistentOrder()` 无错误。

其他手段：

- 缩短事务：锁只覆盖必须的写，不要跨网络调用持锁。
- `SELECT ... FOR UPDATE` 预锁并按固定顺序，或用单条 `UPDATE ... WHERE sku = ANY(...) ORDER BY` 一次拿多行。
- 捕获 `40P01` 时可重试，但根本修复是消除环，不是加重试。

## 常见误判

- 看到 40P01 就调大 `deadlock_timeout`：只是延后检测，环还在。
- 只在应用层加互斥：多实例部署后互斥失效，数据库仍会死锁。
- 查 `pg_locks` 只看 `granted=true`：看不到谁在等谁。

## 自检

```bash
cd 06-实验代码/E07-pg-owner-race
cat evidence/deadlock.txt
```
