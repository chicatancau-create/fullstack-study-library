# E08：PostgreSQL 执行计划、迁移与恢复

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E08。
> 本实验在**真实 PostgreSQL 18.6** 上做索引前后执行计划、可回滚迁移与 `pg_dump` 恢复；不覆盖生产 RPO/RTO。
> 环境：Windows 10.0.28000 + Node v24.15.0 + PostgreSQL 18.6

## 1. 做了什么、没做什么

做了什么：

- 合成 50,000 行 `events`，对 `tenant + kind + ORDER BY created_at` 查询做 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`。
- 建复合索引 `(tenant, kind, created_at DESC)` 后再执行同一查询；保存前后完整计划。
- 事务内迁移：加 `note` 可空列 → 回填 → `SET NOT NULL`；验证旧列查询仍可用。
- `pg_dump --schema=e08` → `DROP SCHEMA` → `psql -f` 恢复；核对 50,000 行、`note NOT NULL`、8 个约束。
- 全部命令失败即非零；记录数据库版本与原始计划。

没做什么：

- 没有生产数据/流量；50k 是合成数据，单次执行，不是容量结论。
- 没有比较多个索引方案、统计信息漂移、锁等待、VACUUM/膨胀。
- 没有 RPO/RTO/异地备份/时间点恢复；只做同机 dump/restore。
- 没有旧/新应用同时读写的兼容矩阵；只验证旧列查询仍可用。
- 没有把迁移接到项目 02/CI。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 无索引时查询走 Seq Scan，建复合索引后走 Index Scan | 前后 JSON 计划 | **成立**：`seq_scan=true → index_scan=true` |
| H2 | 索引后同一查询执行时间下降 | 单次 `Execution Time` | 2.605ms → 0.081ms（仅本机单次，不作容量结论） |
| H3 | 加列迁移可原子完成且不破坏旧列 | 事务 + `information_schema` + 旧查询 | **成立**：nulls=0、note NOT NULL、旧查询可用 |
| H4 | dump 后删 schema 再 restore，数据/结构一致 | `pg_dump`/`psql` + 计数/约束 | **成立**：50,000 行、note NOT NULL、8 约束 |

## 3. 环境

```text
OS        : Windows 10.0.28000 x64
Node      : v24.15.0
PostgreSQL: 18.6（Windows x64，D:\PostgreSQL\18）
数据库    : study_lab，schema e08
工具      : pg_dump.exe / psql.exe（PGBIN 默认 D:/PostgreSQL/18/bin）
凭据      : 只从 PGPASSWORD 读取；不写入仓库
```

## 4. 执行命令

```bash
cd 06-实验代码/E08-pg-plan-migrate
npm ci
PGPASSWORD=<local-test-password> bash scripts/run_evidence.sh
echo $?
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

-- 迁移（事务内）
BEGIN;
ALTER TABLE e08.events ADD COLUMN note text;
UPDATE e08.events SET note = '' WHERE note IS NULL;
ALTER TABLE e08.events ALTER COLUMN note SET NOT NULL;
COMMIT;
```

## 6. 结果

| 项 | 实际 | 证据 |
| --- | --- | --- |
| 数据量 | 50,000 行 | `evidence/setup.txt` |
| 索引前 | Seq Scan，2.605ms | `evidence/explain-before.json` |
| 索引后 | Index Scan，0.081ms | `evidence/explain-after.json` |
| 迁移 | nulls=0、note NOT NULL、旧查询可用 | `evidence/migrate.txt` |
| 备份/恢复 | dump 2,402,823 bytes；恢复 50,000 行、8 约束 | `evidence/backup.txt` |
| 门禁 | `gate_failures: 0` | `evidence/run.txt` |

> dump 文件约 2.4MB，**不入 Git**；`pg_dump` 命令在 `src/backup.mjs`，可重新生成。

## 7. 边界

1. 单次、同机、合成数据；执行时间不是容量/性能承诺。
2. 索引只验证一个查询模式；没有多方案/统计信息/膨胀/锁等待。
3. 迁移只加可空→回填→NOT NULL；没有双写/双读/回滚窗口演练。
4. 恢复只到同机同版本；没有 RPO/RTO、异地、PITR、备份校验。
5. 没有旧/新应用并行兼容矩阵；只验证旧列查询。
6. 没有接入项目 02/CI；不能据此宣称 G4/G6 通过。

## 8. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M07 数据与 SQL | 部分 | 真实 PG、执行计划、索引、迁移 |
| M12 发布与可靠性 | 部分 | dump/restore 同机核对；无 RPO/RTO |
| E08 | **本实验** | 无多方案/生产恢复 |
| G4/G6 | 仅子项 | 不代表关口通过 |

## 9. 目录结构

```text
E08-pg-plan-migrate/
├── src/setup.mjs / explain.mjs / migrate.mjs / backup.mjs / db.mjs
├── scripts/env.mjs / run_evidence.sh
├── evidence/              setup/explain/migrate/backup/run + 计划 JSON
└── package.json / package-lock.json
```