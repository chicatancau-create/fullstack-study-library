# SQL 50 题（离线可判定）

> MS4 专题 1。题目只依赖 `数据/schema.sql` + `数据/seed.sql`，不联网。

## 覆盖

- 基础查询 10（SELECT/JOIN/GROUP BY/HAVING/子查询）
- 窗口函数 8（ROW_NUMBER/RANK/DENSE_RANK/LAG/LEAD/累计/NTILE/FIRST_VALUE）
- 事务与锁 8（隔离级别、约束、行锁、索引元数据）
- 执行计划相关查询 8（索引/连接/子查询形态）
- 迁移与恢复 8（information_schema、schema、版本）
- 方言差异 8（拼接、NULL 排序、类型转换、JSONB、日期）

## 判定

```bash
PGPASSWORD=... bash 判定脚本/judge.sh
```

- 每题：答案 SQL 与候选 SQL 都在同一 schema/seed 上执行，按 `|` 分隔逐行比较。
- 默认候选取 `答案/`；可用 `CANDIDATE=<目录>` 指向学生提交。
- 输出 `SQL50 PASS n/50`；任一不一致即非零。
- 自测：`SELFTEST=1` 会把 Q01 替换为错误 SQL，预期判定失败（证明判定有牙齿）。

## 真实环境层

`真实环境/` 在 PostgreSQL 18.6 上用两个独立连接验证写偏差（RC/RR）、Serializable `40001`、死锁 `40P01`、`lock_timeout 55P03`，并用 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 判定索引使用。入口：

```bash
cd 真实环境
npm install --no-audit --no-fund
PGPASSWORD=<local-test-password> bash run.sh
```

证据在 `真实环境/evidence/`；它不替代上面 50 题的结果集判定。

## 边界

- 判的是结果集，不检查 SQL 写法、索引是否真的被使用；执行计划题只验证数据结果。
- 事务/锁题验证的是隔离级别、约束与行锁可执行性，不模拟双会话并发时序。
- 真实环境层已覆盖：PostgreSQL 18 双连接并发、`EXPLAIN` 索引使用、加列双写/回填/回滚/切读迁移、PostgreSQL 与 MySQL 8.4 方言对照（各 6/4/11/8 项）。
- 50 题结果集本身只在 PostgreSQL 上判定；MySQL 侧只跑方言对照，不含 50 题等价重写。
