# G4 Node.js 后端 + 数据库

> 自学自测包。函数题 + 真实 PostgreSQL（越权 / 注入 / 乐观锁 / 分页 / 事务回滚）。

## 两道子题

| 子题 | 位置 | 抓什么 |
| --- | --- | --- |
| 函数题 | `起始代码/index.mjs` → `canAccess` | 租户隔离 + RBAC 的最小判定 |
| 真实数据库 | `起始代码/db/access.mjs` | 4 处真实缺陷：跨租户越权、SQL 注入、丢失更新、分页不稳 |

## 函数题

```bash
node 自测脚本/smoke.mjs
node 自测脚本/grade.mjs 起始代码/index.mjs
```

## 真实 PostgreSQL

用本机 PostgreSQL 18 的 `study_lab` 库，只操作 `g4_lab` / `g4_lab_migrate` 两个 schema。

```bash
bash scripts/db_setup.sh            # 建表 + 种子 + 迁移回滚演练
node 自测脚本/grade-db.mjs 起始代码/db/access.mjs
```

连接参数来自环境变量（默认已对齐本机）：`PGHOST=127.0.0.1`、`PGPORT=5432`、`PGUSER=study`、`PGPASSWORD=study-pass`、`PGDATABASE=study_lab`。

### 九项数据库判据（`grade-db.mjs`，10 次断言）

| 编号 | 判据 | 抓的缺陷 |
| --- | --- | --- |
| D1 | 跨租户列表为空 | 漏 `tenant_id` 条件 |
| D2 | 同租户列表有数据 | 主路径 |
| D3 | `UNION` 注入不泄露他租户 | 字符串拼接 |
| D4 | 畸形输入不抛未处理错误、主表仍在 | 拼接 + 未参数化 |
| D5 | `version` 不匹配 → 返回 `null` 且数据未变 | 丢失更新 |
| D6 | `version` 匹配 → 更新成功且 `version+1` | 乐观锁 |
| D7 | 20 并发同版本只有 1 个成功 | 并发下只有一条 `UPDATE` 命中 |
| D8 | keyset 翻页 26 行不重不漏 | `OFFSET` 分页不稳 |
| D9 | 第二写失败 → 整笔回滚（错误码 `23503`） | 事务边界 |

> 每次开跑都会重放 `db/schema.sql`：`g4_lab` 是一次性实验 schema，而且“拼接实现”可能把表删掉，重建才能保证判据稳定。

## 迁移回滚

`db/migrate_rollback.sql` 演示 `status → status + closed_at` 的 up 与 down：up 给 `done` 补 `closed_at`，down 把 `closed_at` 折回 `archived` 再删列，最后校验行数不变。

## 证据

`npm run evidence` 生成：

- `evidence/judge-solution.txt` / `judge-starter.txt` —— 函数题
- `evidence/db-setup.txt` —— 建表与迁移回滚输出
- `evidence/db-solution.txt` / `db-starter.txt` —— 数据库 10 条
- `evidence/mutation.txt` —— 4 个注入缺陷全部被抓

实测：答案 10/10；起始代码 8 条 fail；变异 4/4。

## 环境说明

- 需要本机 PostgreSQL 18 在跑（`postgresql-x64-18` 服务）且账号 `study` 可写 `study_lab`。
- `pg` 8.23.1 装在包内（`npm install`）。`psql` 只用于 `db_setup.sh`，判分不用它——避免 Windows 代码页把中文参数编坏。
- 没有数据库时 `evidence.sh` 会写 `SKIP` 且返回非 0，不伪造通过。

## 边界

- 不测连接池上限、PITR 备份、多机主从；这些在 P02 项目层覆盖。
- 不引入 ORM；本题只考 SQL 与事务语义。
- 本包为自学设计：起手代码故意做坏，不含隔离或防作弊。
