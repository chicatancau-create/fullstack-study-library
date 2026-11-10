# G6 毕业项目（多租户）

> 自学自测包。函数题 + 真实多租户脚手架（隔离 / RBAC / 审计 / 批量逐项 / 软删 / 兼容变更）。

## 两道子题

| 子题 | 位置 | 抓什么 |
| --- | --- | --- |
| 函数题 | `起始代码/index.mjs` → `tenantView` | 租户过滤 + 审计 who/when/what/before/after |
| 多租户脚手架 | `起始代码/db/tenant.mjs` | 4 处真实缺陷：跨租户越权写、审计缺 before、批量遇错整体崩、软删仍可见 |

## 函数题

```bash
node 自测脚本/smoke.mjs
node 自测脚本/grade.mjs 起始代码/index.mjs
```

## 多租户脚手架（PostgreSQL）

只用 `study_lab` 里的 `g6_lab` schema（`tenant` / `member` / `task` / `audit`）。

```bash
bash scripts/db_setup.sh
node 自测脚本/grade-tenant.mjs 起始代码/db/tenant.mjs     # 目标 14/14
```

### 判据（`grade-tenant.mjs`，14 次断言）

| 编号 | 判据 | 抓的缺陷 |
| --- | --- | --- |
| G1 | 列表只回本租户 | 漏 `tenant_id` |
| G2 | 软删任务默认不可见；`includeDeleted: true` 才可见 | 漏 `deleted_at IS NULL` |
| G3 | 跨租户写入被拒且数据未变 | `UPDATE` 缺 `tenant_id` |
| G4 | `viewer` 写入被拒 | 缺 RBAC 判断 |
| G5 | 审计有 `who` 且 `before` / `after` 都在 | 审计只记 after |
| G6 | 批量三项一项缺失 → 逐项结果，不整体抛错 | 遇错直接 throw |
| G7 | `member` 批量改状态被逐项拒 | 批量缺权限 |
| G8 | `expandSchema` 加可空列后旧查询仍可用 | 兼容变更 |

实测：答案 14/14；起始代码 7 条 fail。

> 判分时每段开始前都重放 `db/schema.sql`：缺陷会互相污染（越权写入会推进 version），只有每段独立，失败才能归因。

## 设计要点

- **租户条件进 SQL**：`WHERE id = $1 AND tenant_id = $2`，不是应用层过滤。
- **审计 before 先取**：`SELECT ... FOR UPDATE` 拿旧值，再 `UPDATE ... RETURNING` 拿新值，同一事务写审计。
- **批量逐项**：单项失败 `continue` 记录 `{ok:false, reason}`，整体仍 `COMMIT` 已成功项。
- **兼容变更（expand）**：先加可空列，旧代码不受影响；收窄（contract）留到下一轮。

## 证据

`npm run evidence` 生成：

- `evidence/judge-solution.txt` / `judge-starter.txt` —— 函数题
- `evidence/db-setup.txt` —— 建表
- `evidence/tenant-solution.txt` / `tenant-starter.txt` —— 多租户 14 条
- `evidence/mutation.txt` —— 5 个注入缺陷全部被抓

## 边界

- 不测 RAG 深度选项（版本化 golden set、真实引用、越权检索）——那部分在 MS9 的 RAG65 里。
- 不引入 ORM；只考 SQL、事务、审计与批量语义。
- 本包为自学设计：起手代码故意做坏，不含隔离或防作弊。
