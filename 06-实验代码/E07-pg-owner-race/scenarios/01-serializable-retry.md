# 反例 01：用 READ COMMITTED 做"至少留一个 Owner"

## 症状

两个管理员同时把自己从 Owner 降级，业务规则是"至少保留一个 Owner"，结果两个都成功，团队 0 个 Owner。READ COMMITTED 下每个事务只看到自己开始时的快照，写入不冲突，规则被写偏差绕过。

## 装置

`src/tx.mjs` 的 `serializableWriteSkew()`：两个 `SERIALIZABLE` 事务各自 `count(on_call)=2`，各自下线自己；后提交者必须收到 `40001`。

实测（`evidence/serializable.txt`）：第一次读都是 2，先提交成功，后提交 `40001`。

## 修复

1. 业务写操作提升到 `SERIALIZABLE`，捕获 `40001` 后**有界重试**：`retrySerializable(fn, { retries: 3 })`，指数/线性退避，重试次数耗尽就失败。
2. 重试后的新事务重新读数据，再按最新状态判断（实测：重试读到 1，业务拒绝"最后一名值守人员不能下线"）。
3. 只重试 `40001`（serialization_failure）与 `40P01`（deadlock_detected，若策略允许）；业务错误不重试。
4. 更轻的方案：父行 `FOR UPDATE` 锁住聚合同一纬度的记录，把并发串行化；Serializable 适合无法用单行锁表达的不变量。

## 常见误判

- 以为 `REPEATABLE READ` 能防写偏差：它防不可重复读/幻读的一部分，但两个事务改不同行时仍可能写偏差。
- 把 `40001` 当致命错误直接 500：它是"重试即可"的信号。
- 无界重试/无退避：冲突风暴下会把数据库压得更死。

## 自检

```bash
cd 06-实验代码/E07-pg-owner-race
node --test --test-concurrency=1 tests/transaction.test.js
cat evidence/serializable.txt
```
