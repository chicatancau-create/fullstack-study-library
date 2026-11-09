# 场景 04：down migration ≠ 恢复

## 触发条件

对已有数据的 `orders` 表加 `total NOT NULL`，然后分别尝试：坏迁移被拒、前向修复、执行 down migration、从 dump 恢复。

## 观察到的现象

- 直接 `ADD COLUMN total numeric NOT NULL` 在非空表上被拒：`23502`（column contains null values）。
- 前向修复：加可空列 → 回填 0 → `SET NOT NULL` → `SET DEFAULT 0`，3 行全部保留。
- 写入 2 行非零 total 后执行 `DROP COLUMN total`：列消失、行仍为 3，但 **2 行已写入的 total 丢失**。
- `pg_dump --table=e08r.orders`（1842B）→ 插入 1 行 → 删表 → `psql -f` 恢复：行数回到 dump 时的 3，**dump 后的写入丢失**；结构与 dump 时一致。

## 判读

- `evidence/rollback.txt` 必须同时出现 `23502`、`down migration: ... 2 rows lost`、`restore: ... post-dump write lost`。
- down migration 保行丢列值；restore 连结构和 dump 后写入一起回退。两者不能互相替代。

## 边界

同机同版本 dump/restore；未做 PITR、异地备份、备份完整性校验，也不覆盖恢复耗时（RTO）。
