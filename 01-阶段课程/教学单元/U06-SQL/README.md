# U06：SQL 约束、事务、索引与恢复边界

> 前置：完成 U03；知道表、行、列的基本概念。
>
> 本单元用 Python 内置 `sqlite3` 做真实 SQL 实验：约束、外键、唯一键、事务回滚、聚合、执行计划。SQLite 是单机库，不是 PostgreSQL；边界写在第 9 节。

## 1. 目标 / 非目标 / 产出

**目标**

- 用主键、外键、唯一、非空、CHECK 约束保护数据，而不是只靠应用层 if。
- 解释事务的原子性与回滚；知道 SQLite 的 `BEGIN/COMMIT/ROLLBACK` 行为。
- 写 LEFT JOIN + 聚合，正确处理“没有记录的用户”。
- 用 `EXPLAIN QUERY PLAN` 看索引是否被使用；理解复合索引列顺序。
- 区分“代码回滚”和“数据恢复”；知道迁移/备份的基本流程。

**非目标**

- 不覆盖 PostgreSQL 的 MVCC、隔离级别、锁等待、死锁细节（E07/E08 负责）。
- 不做生产数据库部署、连接池、分库分表。
- 不把 SQLite 结论外推为 MySQL/PostgreSQL 行为。

**产出**

- 运行 10 条 SQLite 测试与演示。
- 完成练习、自测与 [盲测](blind/README.md)；答案在 [answers](answers/README.md)。

## 2. 心智模型

关系模型把数据看成**行的集合**，约束是数据库层面的不变量。应用层校验会被绕过（脚本、并发、旧版本），数据库约束是最后防线。外键默认在 SQLite 里是**关闭**的，必须 `PRAGMA foreign_keys = ON`，否则“外键”只是注释。

事务把多条语句包成一个原子单元：要么都提交，要么都回滚。回滚只撤销未提交的写，不会撤销已经提交的数据；已经发给外部系统的副作用也不会自动回滚。

索引是额外的数据结构，用写放大和空间换读速度。复合索引 `(user_id, status)` 能服务 `WHERE user_id=? AND status=?`，但单独 `status=?` 未必能用；列顺序要跟查询模式走。`EXPLAIN QUERY PLAN` 看的是优化器的选择，不是“加了索引就一定用”。

## 3. 讲义

### 3.1 约束

```sql
CREATE TABLE records (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title   TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  status  TEXT NOT NULL CHECK (status IN ('draft','done')),
  UNIQUE (user_id, title)
);
```

- `NOT NULL`：缺值直接拒绝。
- `UNIQUE`：重复键报 `IntegrityError`；复合唯一约束防同一用户重复标题。
- `CHECK`：范围/枚举；不要把业务规则全塞进 CHECK，复杂的用事务+约束组合。
- `ON DELETE CASCADE`：删用户时删记录；要确认这是业务想要的，不是“省事”。

### 3.2 事务

```python
conn.execute("BEGIN")
add_record(conn, user_id, "will rollback", 5)
conn.rollback()
```

SQLite 默认 autocommit 模式下每条语句独立提交；显式 `BEGIN` 后才能整体回滚。事务里失败要 `rollback`，不要吞异常继续提交。

### 3.3 聚合与空值

```sql
SELECT u.name, COUNT(r.id), COALESCE(SUM(r.minutes), 0)
FROM users u LEFT JOIN records r ON r.user_id = u.id
GROUP BY u.id, u.name;
```

`LEFT JOIN` 保留没有记录的用户；`COUNT(r.id)` 对 NULL 不计数，`SUM` 返回 NULL 时用 `COALESCE` 变 0。`COUNT(*)` 会把“一条 NULL 行”算成 1，语义不同。

### 3.4 索引与执行计划

```sql
CREATE INDEX idx_records_user_status ON records (user_id, status);
EXPLAIN QUERY PLAN
SELECT * FROM records WHERE user_id = 1 AND status = 'done';
```

输出 `SEARCH records USING INDEX idx_records_user_status (user_id=? AND status=?)` 说明用了复合索引。只查 `status` 时可能全表扫描；不要凭感觉加索引，先看计划和数据分布。

### 3.5 迁移与恢复

- 迁移：新字段先可空/有默认值 → 回填 → 加约束 → 切换读写 → 清理旧字段；每步可回滚。
- 备份：SQLite 用 `.backup`/文件复制需在一致状态；PostgreSQL 用 `pg_dump`/物理备份。
- 恢复：还原到**独立库**核对行数/约束/业务可读性，再切换；不要直接覆盖有写入的生产库。
- 代码回滚 ≠ 数据恢复：旧代码可能读不懂新数据。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U06-SQL
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状）：

```text
test exit=0
demo exit=0
test: Ran 10 tests in ...s / OK
demo: DEMO PASS
plan: plan: SEARCH records USING INDEX idx_records_user_status (...)
gate_failures: 0
```

实际输出见 `evidence/test.txt`、`demo.txt`、`run.txt`。

## 5. 常见错误

### 错误 1：SQLite 外键没开

- 现象：插入不存在的 user_id 也成功。
- 定位：`PRAGMA foreign_keys` 是否为 1。
- 修复：每次连接执行 `PRAGMA foreign_keys = ON`。
- 回归：孤儿记录插入抛 `IntegrityError`。

### 错误 2：把约束只写在应用层

- 现象：脚本/并发/旧版本绕过校验，数据脏。
- 定位：检查表定义是否有 NOT NULL/UNIQUE/CHECK/FK。
- 修复：数据库约束 + 应用层友好错误；两者都要。
- 回归：直接 SQL 插入坏数据必须失败。

### 错误 3：事务里吞异常继续提交

- 现象：半成功状态。
- 定位：异常路径是否 `rollback`。
- 修复：`try/except` 回滚并重新抛出；提交前核对不变量。
- 回归：故意制造失败，验证前后行数一致。

### 错误 4：只加索引不看计划

- 现象：索引没被用，或写变慢。
- 定位：`EXPLAIN QUERY PLAN`；看扫描/搜索与索引名。
- 修复：按查询模式调整复合索引顺序；删除无用索引。
- 回归：计划中出现预期索引，查询结果不变。

### 错误 5：用 OFFSET 做深分页

- 现象：页码越大越慢，数据变动会跳行/重复。
- 定位：`LIMIT ? OFFSET ?` 与大 offset。
- 修复：基于有序唯一键的游标分页（`WHERE (created_at,id) < (?,?)`）。
- 回归：翻页无重复/遗漏，计划稳定。

## 6. 练习

### 基础

1. 增加 `tags` 表与 `record_tags` 多对多关联，写约束与查询。
2. 查“每个用户已完成记录的分钟总和”，没有记录的用户显示 0。
3. 给 `records(status, minutes)` 建索引，比较计划与查询。

### 边界

4. 同一用户重复标题、负数分钟、非法状态、孤儿用户各写一条失败测试。
5. 事务中先插入再违反唯一约束，验证回滚后无半状态。
6. 用 `.backup` 复制数据库到临时文件，核对行数与约束；说明为什么不能直接拷贝正在写的库。

## 7. 自测

1. 主键、唯一、外键、CHECK 各保护什么？
2. 为什么 SQLite 外键默认关闭？开启后有什么代价？
3. 事务回滚能撤销已提交数据或外部副作用吗？
4. 复合索引 `(a,b)` 对 `WHERE b=?` 一定有用吗？
5. 代码回滚与数据恢复的区别？

答案见 [answers/README.md](answers/README.md)。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。要求独立设计多租户记录表、约束、查询与迁移；不附答案。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M07 数据与 SQL | 部分 | 约束、事务、聚合、索引计划；SQLite 单机 |
| E07/E08 | 参考 | 真实 PostgreSQL 的 Owner 竞态/迁移恢复未做 |
| G4 | 不覆盖 | 无真实 DB、并发事务、租户隔离，不代表 G4 |

## 10. 官方资料与查阅日期

- [SQLite 文档](https://www.sqlite.org/docs.html)：2026-11-07 查阅；Python 3.14.2 内置 sqlite3。
- [PostgreSQL 文档](https://www.postgresql.org/docs/)：2026-11-07 查阅（仅对照，未实跑）。
- [SQLite 外键](https://www.sqlite.org/foreignkeys.html)：2026-11-07 查阅。
- 版本边界：SQLite 与 PostgreSQL 的隔离/锁/类型行为不同；不要把本单元结论直接外推。

## 11. 证据

- `evidence/test.txt`、`demo.txt`、`run.txt`
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256