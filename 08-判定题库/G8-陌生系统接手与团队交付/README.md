# G8 陌生系统接手与团队交付

> 自学自测包。「陌生系统接手练习」：固定旧系统、缺陷清单公开、参考答案公开。

## 两道子题

| 子题 | 位置 | 抓什么 |
| --- | --- | --- |
| 函数题 | `起始代码/index.mjs` → `normalizeOrders` | 去重、负数量归零、金额重算 |
| 遗留系统接手 | `起始代码/src/legacy.mjs` | 7 个公开缺陷，修到 `grade-legacy.mjs` 15/15 |

## 固定旧系统（`g8_lab` schema）

```bash
bash scripts/db_setup.sh
node 自测脚本/grade-legacy.mjs 起始代码/src/legacy.mjs --baseline   # 必须复现 A–G 七组
node 自测脚本/grade-legacy.mjs 起始代码/src/legacy.mjs              # 应先看到失败
node 自测脚本/grade-legacy.mjs 参考答案/src/legacy.mjs              # 15/15
```

`db/schema.sql` 是「遗留结构」：`task` 表没有 `version` 列、只按 `created_at` 单列建索引。
`db/migrate_fix.sql` 是修复所需迁移（加 `version`、换稳定排序索引、加前缀索引）。

## 七个公开缺陷

| 编号 | 缺陷 | 应失败断言 |
| --- | --- | --- |
| A | refresh 轮换不吊销旧 token，并发可重放 | `A 同一 refresh 只能轮换 1 次` |
| B | `JWT_SECRET` 缺失时退回常量密钥 | `B 无 JWT_SECRET 时拒绝签发` |
| C | catch 把 `error.stack` 回给调用方 | `C 不回 stack` / `C 回稳定错误码` |
| D | `updateTask` 不带 `version`，丢失更新 | `D 同版本只有 1 个赢` |
| E | 列表只按 `created_at` 排序，同秒不稳 | `E 两页不重复` / `E 同秒行按 id 降序` |
| F | `getTask` 只按 id 查，跨租户可读 | `F 跨租户 getTask 返回 null` |
| G | 列表把搜索词包成 `%x%`，前缀索引用不上 | `G 不用前导通配 %x%` + 两条索引存在 |

实测：起始代码 8 条 fail（A–G 每组至少 1 条）；参考答案 15/15。

## 失败先行（baseline 模式）

```bash
node 自测脚本/grade-legacy.mjs 起始代码/src/legacy.mjs --baseline
```

`--baseline` 不要求全 fail，只要求 **A–G 七组每组都有 FAIL**；正向对照（`B` 签验一致、`F` 同租户可读）允许 PASS。这比“全 fail”更能证明“缺陷确实存在且被测到”。

## 交接练习

照 `交接模板.md` 写一份交接文档，至少包含：

- 仓库地图（哪个文件负责什么、迁移在哪）
- 运行手册（起库、跑测试、回滚命令）
- 风险清单（7 个缺陷里哪些是安全类、哪些是数据一致性类）
- 未修复项与建议下一步

自评按「缺陷修复率 / 交接文档质量 / 自我评估准确度」三项打分。

## 证据

`npm run evidence`：

- `evidence/judge-solution.txt` / `judge-starter.txt` —— 函数题
- `evidence/db-setup.txt` —— 遗留结构 + 修复迁移
- `evidence/baseline.txt` —— 七组缺陷全部复现
- `evidence/legacy-solution.txt` —— 参考答案 15/15
- `evidence/mutation.txt` —— 7 组注入缺陷全部被抓

## 环境说明

- PostgreSQL 18.6 @`study_lab`，schema `g8_lab`。
- `pg` 8.23.1 装在包内；判分不用 psql（`db_setup.sh` 除外）。
- 没有数据库时 `evidence.sh` 写 `SKIP` 并返回非 0。

## 边界

- 旧系统是“本人项目快照注入缺陷”，不是真实他人代码，也不是真实事故（与 `02-项目实战/项目05` 的口径一致）。
- 缺陷清单与答案全部公开——这是自学设计，不做防作弊。
