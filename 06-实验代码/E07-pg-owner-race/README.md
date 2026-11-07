# E07：PostgreSQL 最后 Owner 竞态与库存扣减

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E07。
> 本实验在**真实 PostgreSQL 18.6** 上用两个独立连接复现写偏差，再用父行锁修复；不覆盖迁移/恢复（E08）。
> 环境：Windows 10.0.28000 + Node v24.15.0 + PostgreSQL 18.6

## 1. 做了什么、没做什么

做了什么：

- 建 `workspaces/members/inventory` 三表，members 有复合主键与 role CHECK，库存有 `qty >= 0`。
- 两个独立连接、READ COMMITTED：各自 `count(owner)=2`，各自删自己，最终 **0 个 Owner**（写偏差）。
- 修复：先 `SELECT ... FROM workspaces WHERE id=1 FOR UPDATE` 锁父行；第二个事务等待，拿到锁后看到只剩 1 个 Owner 并回滚，最终保留 1 个。
- 库存：`UPDATE ... WHERE qty >= 1` 条件扣减；并发下只有一个成功，qty=0，不为负。
- 3 条真实数据库测试，全部通过；记录 PostgreSQL 版本与隔离级别。

没做什么：

- 没有用 Serializable 重试方案对照；没有测死锁/序列化失败。
- 没有接业务 API/项目 02；没有迁移、备份、恢复（E08）。
- 没有多机/连接池/长事务；没有测性能。
- 没有把 `study` 账号用于生产；凭据只从环境变量读取。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 两个 Owner 各自 count=2 后删自己，会写偏差到 0 Owner | 两连接 READ COMMITTED | **成立**：最终 ownerCount=0 |
| H2 | 锁 workspace 父行可让第二个事务看到已提交删除并拒绝 | 两连接 + FOR UPDATE | **成立**：第二个 count=1，回滚后保留 1 |
| H3 | 条件扣减 `qty >= 1` 不会让库存为负 | 并发 UPDATE | **成立**：一个 rowCount=1，一个 0，qty=0 |

## 3. 环境与准备

```text
OS       : Windows 10.0.28000 x64
Node     : v24.15.0
PostgreSQL: 18.6（Windows x64）
数据库   : study_lab，schema e07
隔离级别 : READ COMMITTED（默认）
```

本地准备（密码用你自己的合成值，不要提交）：

```sql
CREATE ROLE study LOGIN PASSWORD '<local-test-password>' CREATEDB;
CREATE DATABASE study_lab OWNER study;
```

```bash
export PGHOST=127.0.0.1
export PGUSER=study
export PGDATABASE=study_lab
export PGPASSWORD='<local-test-password>'
```

## 4. 执行命令

```bash
cd 06-实验代码/E07-pg-owner-race
npm ci
bash scripts/run_evidence.sh
echo $?
```

`run_evidence.sh` 没有 `PGPASSWORD` 会直接退出 2，不会用默认弱口令。

## 5. 关键 SQL

反例：

```sql
BEGIN;
SELECT count(*) FROM e07.members WHERE workspace_id = 1 AND role = 'owner'; -- 2
DELETE FROM e07.members WHERE workspace_id = 1 AND user_id = 'alice';
COMMIT;
-- 另一个连接同样看到 2，删 bob 并提交 -> 0 个 Owner
```

修复：

```sql
BEGIN;
SELECT id FROM e07.workspaces WHERE id = 1 FOR UPDATE; -- 统一锁顺序
SELECT count(*) FROM e07.members WHERE workspace_id = 1 AND role = 'owner';
DELETE FROM e07.members WHERE workspace_id = 1 AND user_id = 'alice';
COMMIT;
```

库存：

```sql
UPDATE e07.inventory SET qty = qty - 1 WHERE sku = 'x' AND qty >= 1 RETURNING qty;
```

## 6. 结果

| 用例 | 实际 | 证据 |
| --- | --- | --- |
| 写偏差反例 | 最终 ownerCount=0 | `evidence/test.txt` |
| 父行锁修复 | 第二个事务 count=1，回滚，ownerCount=1 | `evidence/test.txt` |
| 库存条件扣减 | 一个成功、一个 0 行，qty=0 | `evidence/test.txt` |
| 门禁 | `tests 3 pass 3 fail 0`，`gate_failures: 0` | `evidence/run.txt` |

## 7. 边界

1. 单机 PostgreSQL；没有网络分区/多主/连接池。
2. 只测 READ COMMITTED；Serializable 重试、死锁、锁等待超时未测。
3. 只锁一个父行；多工作区批量操作要统一锁顺序，否则仍可能死锁。
4. 没有业务 API/权限矩阵；E11 另行验证对象级授权。
5. 没有迁移/备份/恢复；E08 负责。
6. 测试使用合成数据；不是生产容量/一致性证明。

## 8. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M07 数据与 SQL | 部分 | 真实 PG、事务、写偏差、父行锁、条件扣减 |
| E07 | **本实验** | 无 Serializable 对照/连接池/迁移 |
| G4 | 仅 Owner/库存子项 | 无项目 02、迁移恢复、完整权限矩阵 |

## 9. 目录结构

```text
E07-pg-owner-race/
├── src/db.mjs             连接、schema、reset、查询
├── tests/owner.test.js    写偏差/父行锁/库存
├── scripts/env.mjs        版本与隔离级别
├── scripts/run_evidence.sh
├── evidence/              env/test/run + manifest
└── package.json / package-lock.json
```