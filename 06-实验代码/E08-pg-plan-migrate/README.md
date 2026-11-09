# E08：PostgreSQL 执行计划、迁移与回滚

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E08。
> 本实验在**真实 PostgreSQL 18.6** 上做索引前后执行计划、expand/contract 迁移、兼容矩阵、改类型锁窗口、代码回滚与 Prisma 演练；不覆盖生产 RPO/RTO。
> 环境：Windows 10.0.28000 + Node v24.15.0 + PostgreSQL 18.6

## 1. 做了什么、没做什么

做了什么：

- 合成 50,000 行 `events`，对 `tenant + kind + ORDER BY created_at` 查询做 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`；建复合索引后再测同一条查询。
- 事务内迁移：加 `note` 可空列 → 回填 → `SET NOT NULL`；验证旧列查询仍可用。
- `pg_dump --schema=e08` → `DROP SCHEMA` → `psql -f` 恢复；核对行数、`note NOT NULL`、约束数。
- **expand/contract 七阶段**：加列（catalog-only）→ 5 批回填 → 双写窗口 → 校验 → 切读 → 删旧列，每阶段断言。
- **兼容矩阵**：old/new 应用 × schema N-1/N/N+1，共 12 个读写格子。
- **改类型**：持锁事务下观察 `AccessExclusiveLock` 排队与并发写入停顿；短 `lock_timeout` 复现 55P03。
- **代码回滚**：坏迁移被拒（23502）、前向修复、down migration（丢列值）、`pg_dump` 恢复（丢 dump 后写入）。
- **Prisma 演练**：`prisma migrate diff` 生成 DDL，落到独立 schema，与手写 SQL 的列结构逐列比对。
- 全部命令失败即非零；记录数据库版本与原始计划。

没做什么：

- 没有生产数据/流量；50k/20k/5万 都是合成数据，单次执行，不是容量结论。
- 没有比较多个索引方案、统计信息漂移、VACUUM/膨胀。
- 没有 RPO/RTO/异地备份/时间点恢复；只做同机 dump/restore。
- 兼容矩阵只覆盖列增删，不覆盖约束、默认值、函数签名与消息格式。
- 改类型只覆盖 integer→bigint 与 numeric 两种，未覆盖大表长重写、复制延迟。
- 没有把迁移接到项目 02/CI。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 无索引时查询走 Seq Scan，建复合索引后走 Index Scan | 前后 JSON 计划 | **成立**：`seq_scan=true → index_scan=true` |
| H2 | 索引后同一查询执行时间下降 | 单次 `Execution Time` | 5.115ms → 0.121ms（仅本机单次，不作容量结论） |
| H3 | 加列迁移可原子完成且不破坏旧列 | 事务 + `information_schema` + 旧查询 | **成立**：nulls=0、note NOT NULL、旧查询可用 |
| H4 | dump 后删 schema 再 restore，数据/结构一致 | `pg_dump`/`psql` + 计数/约束 | **成立**：5 万行、note NOT NULL、约束齐全 |
| H5 | 可空加列是 catalog-only，不重写表 | `relfilenode` + `pg_relation_size` | **成立**：文件号与大小都不变，0.81ms |
| H6 | 新应用在 schema N-1 上读写必然失败 | 12 格矩阵 | **成立**：读/写均 `42703`，其余 10 格 OK |
| H7 | 改类型需等 AccessExclusive；短 lock_timeout 可失败退出 | `pg_locks` + 55P03 | **成立**：观察到未授予锁；200ms 超时放弃 |
| H8 | down migration 与 dump 恢复不是一回事 | 两种回滚后的行/列/数据对照 | **成立**：down 丢 2 行已写 total；restore 丢 dump 后写入 |

## 3. 环境

```text
OS        : Windows 10.0.28000 x64
Node      : v24.15.0
PostgreSQL: 18.6（Windows x64，D:\PostgreSQL\18）
数据库    : study_lab，schema e08 / e08t / e08r / e08c_* / e08_prisma
工具      : pg_dump.exe / psql.exe（PGBIN 默认 D:/PostgreSQL/18/bin）、Prisma CLI 6.16.3（npx）
凭据      : 只从 PGPASSWORD 读取；不写入仓库
```

## 4. 执行命令

```bash
cd 06-实验代码/E08-pg-plan-migrate
npm ci
PGPASSWORD=<local-test-password> npm test
PGPASSWORD=<local-test-password> bash scripts/run_evidence.sh
echo $?
```

单跑某一段：

```bash
node src/stages.mjs        # expand/contract
node src/compat.mjs        # 兼容矩阵
node src/type_change.mjs   # 改类型与锁
node src/rollback.mjs      # 前向修复 / down / restore
node src/prisma_drill.mjs  # Prisma migrate diff 对照
```

## 5. 关键 SQL

```sql
-- 查询
SELECT id, tenant, kind, amount, created_at
FROM e08.events
WHERE tenant = 't1' AND kind = 'click'
ORDER BY created_at DESC
LIMIT 20;

-- 索引
CREATE INDEX e08_events_tenant_kind_created_idx
ON e08.events (tenant, kind, created_at DESC);

-- expand：可空加列（catalog-only）
ALTER TABLE e08.accounts ADD COLUMN email_norm varchar(320);

-- 分批回填
UPDATE e08.accounts SET email_norm = lower(btrim(email))
WHERE id IN (SELECT id FROM e08.accounts WHERE email_norm IS NULL ORDER BY id LIMIT 5000);

-- 改类型：先拿锁，再重写
BEGIN;
SET LOCAL lock_timeout = '200ms';
ALTER TABLE e08t.metrics ALTER COLUMN value TYPE bigint USING value::bigint;
COMMIT;
```

## 6. 结果

| 项 | 实际 | 证据 |
| --- | --- | --- |
| 数据量 | 50,000 行 | `evidence/setup.txt` |
| 索引前 | Seq Scan，5.115ms | `evidence/explain-before.json` |
| 索引后 | Index Scan，0.121ms | `evidence/explain-after.json` |
| 基础迁移 | nulls=0、note NOT NULL、旧查询可用 | `evidence/migrate.txt` |
| 备份/恢复 | dump 约 2.4MB；恢复行数/约束一致 | `evidence/backup.txt` |
| expand | catalog-only，0.81ms，relfilenode 不变 | `evidence/stages.txt` |
| 回填 | 5 批（每批 5000），missing=0 | `evidence/stages.txt` |
| 双写窗口 | 旧写入留下 1 行 null；校验后不一致 0 | `evidence/stages.txt` |
| contract | 新读 OK，旧读 42703，行数 20003 | `evidence/stages.txt` |
| 兼容矩阵 | 12 格；仅 new×N-1 的读/写 42703 | `evidence/compat.txt` |
| 改类型 | AccessExclusive 排队；204ms 完成；11 次写入 0 失败，最大停顿 180.4ms | `evidence/type-change.txt` |
| lock_timeout | 200ms 时 55P03 | `evidence/type-change.txt` |
| 坏迁移 | 非空表加 NOT NULL 被拒：23502 | `evidence/rollback.txt` |
| 前向修复 | 3 行保留，total 全部非空 | `evidence/rollback.txt` |
| down migration | 丢列、保 3 行，2 行已写 total 丢失 | `evidence/rollback.txt` |
| dump 恢复 | 1842B dump；恢复到 3 行，dump 后写入丢失 | `evidence/rollback.txt` |
| Prisma | 11 行 SQL；4 列与手写 DDL 一致 | `evidence/prisma.txt`、`evidence/prisma-diff.sql` |
| 门禁 | tests 5 pass 0 fail，`gate_failures: 0` | `evidence/test.txt`、`evidence/run.txt` |

> dump 文件约 2.4MB，**不入 Git**；`evidence/rollback-dump.sql` 为回滚场景的小 dump（约 1.8KB），可重新生成。

## 7. 边界

1. 单次、同机、合成数据；执行时间不是容量/性能承诺。
2. 索引只验证一个查询模式；没有多方案/统计信息/膨胀/锁等待。
3. expand/contract 是单实例演练；回填批大小人为设定，未测真实流量与长事务。
4. 兼容矩阵只覆盖列增删导致的读写不兼容。
5. 改类型只测 integer→bigint；大表重写时长、复制槽、连接池耗尽未测。
6. 回滚覆盖前向修复、down migration、同机 dump/restore；没有 PITR、异地备份、RTO。
7. Prisma 只做 `migrate diff` 的 DDL 对照，没有跑 `migrate deploy`/影子库。
8. 没有接入项目 02/CI；不能据此宣称 G4/G6 通过。

## 8. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M07 数据与 SQL | 部分 | 真实 PG、执行计划、索引、迁移 |
| M12 发布与可靠性 | 部分 | 兼容矩阵、改类型窗口、dump/restore；无 RPO/RTO |
| E08 | **本实验** | expand/contract、兼容矩阵、锁窗口、回滚 |
| G4/G6 | 仅子项 | 不代表关口通过 |

## 9. 目录结构

```text
E08-pg-plan-migrate/
├── src/
│   ├── setup.mjs / explain.mjs / migrate.mjs / backup.mjs / db.mjs
│   ├── stages.mjs          expand/contract 七阶段
│   ├── compat.mjs          old/new × N-1/N/N+1 兼容矩阵
│   ├── type_change.mjs     改类型锁等待与 55P03
│   ├── rollback.mjs        前向修复 / down / dump 恢复
│   └── prisma_drill.mjs    Prisma migrate diff 对照
├── prisma/schema.prisma
├── tests/migrate.test.js   5 条真实 PG 集成测试
├── scenarios/              01 顺序、02 兼容窗口、03 锁窗口、04 回滚 vs 恢复
├── scripts/env.mjs / run_evidence.sh
├── evidence/               env/setup/explain/migrate/backup/stages/compat/type/rollback/prisma/test/run + 计划 JSON + prisma-diff.sql
└── package.json / package-lock.json
```
