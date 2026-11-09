# SQL50 真实环境层（PostgreSQL 18.6）

> 纯函数/离线判定仍保留在上级目录（结果集比对）；本层补双会话并发与执行计划判定。

## 覆盖

1. **双会话写偏差**：两个独立 `pg.Client`，RC/RR 下交叉更新同一不变量，复现“两名值班同时被取消”。
2. **Serializable**：同一场景第二个提交返回 `40001`。
3. **死锁**：反向锁顺序触发 `40P01`，统一锁顺序后同场景通过。
4. **lock_timeout**：持锁会话阻塞后，等待方在 200ms 返回 `55P03`。
5. **EXPLAIN 判定**：5000 行数据 + `ANALYZE` + `(tenant,status)` 复合索引；正确查询必须走索引且无 `orders` 上的 Seq Scan；在事务内临时删索引模拟“无索引变体”，该变体不得使用目标索引。

## 执行

```bash
cd 08-判定题库/专题题库/SQL50/真实环境
npm install --no-audit --no-fund
PGPASSWORD=<local-test-password> bash run.sh
```

输出：`evidence/concurrency.txt`、`evidence/explain.txt`、`evidence/run.txt`，以及 `explain-good.json` / `explain-bad.json`。

## 边界

- 只验证 PostgreSQL 18.6；MySQL 方言对照、在线迁移/回滚、EXPLAIN 的连接策略与实际行数断言尚未实现。
- 并发场景为本地合成数据与两个连接；不是生产压测或分布式事务。
- “无索引变体”用事务内 `DROP INDEX` 后回滚实现，不是改 `enable_seqscan` 制造通过。
- 证据由脚本生成；`node_modules/` 不入库。
