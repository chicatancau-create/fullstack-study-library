# 场景 03：expand/contract 下回滚旧版本

## 触发条件

`e13.accounts` 只有 `email`；新版本加 `email_norm` 并回填，随后把流量切回旧版本。

## 观察到的现象

- 加列后旧版本仍能 `SELECT id, email`，双写窗口不阻塞旧读。
- 回填后 `email_norm='a@old.test'`，新列可读。
- 回滚到 v1 后，旧查询依然成功；新列保留但不被旧版本依赖。

## 判读

- `evidence/release.txt` 必须同时出现 `old app still reads email` 与 `new column backfilled`。
- 若先删旧列再回滚，旧版本会 42703。

## 边界

只演练加列与回填；没有改类型、锁窗口、备份恢复与 PITR。
