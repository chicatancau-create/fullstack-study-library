# 场景 01：expand/contract 顺序错一步，旧应用就断

## 触发条件

表 `accounts` 已有 2 万行、旧应用只读写 `email`。要把邮箱规范化为 `email_norm` 并删掉旧列。

## 观察到的现象

按 `ADD COLUMN → 分批回填 → 双写 → 校验 → 切读 → DROP 旧列` 顺序执行（`src/stages.mjs`）：

- 加列是 catalog-only：`relfilenode` 与表大小都没变，0.84ms，不重写 2 万行。
- 分批回填 5 批（每批 5000 行）后缺失 0。
- 双写窗口内只写 `email` 的旧写入会留下 1 行 `email_norm IS NULL`——这是预期漂移，不是 bug。
- 校验补齐后不一致 0；切读期间新旧读同时可用。
- 删旧列后新读正常，旧读 SQL 立刻 `42703`（column does not exist），行数仍为 20003。

## 反例

如果先 `DROP COLUMN email` 再发布新代码，旧实例在滚动发布窗口内会持续 42703；如果先 `SET NOT NULL` 再回填，会在非空表上直接 23502 失败。

## 判读

- `evidence/stages.txt` 必须同时出现 `catalog-only`、`missing=0`、`old writer leaves 1 row`、`old reader error=42703`。
- 只看到 `STAGES PASS` 而没看每阶段断言，不能说明顺序正确。

## 边界

单实例、无真实流量；回填每批 5000 行是人为参数，未测锁竞争与长事务。
