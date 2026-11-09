# 场景 01：锁过期了，任务没结束

## 触发条件

客户端 A 用 300ms TTL 获取锁，随后进程暂停 450ms（GC、调度、网络卡顿都可能造成）。锁在 Redis 中已过期，A 仍在执行原任务。

## 观察到的现象

- A 获取锁时 3 个实例返回同一 token；450ms 后 B 用新 token 成功获取同一 key。
- 两个 owner 同时“持锁”，A 并不知道自己已经失去锁。
- 在没有 fencing 的写路径上，A 晚到的 `stale-write` 覆盖了 B 已提交的 `newer-write`。
- 换成带 fencing 的写路径：B 用 fencing=2 先写；A 用 fencing=1 晚到时 `UPDATE ... WHERE fencing < 1` 影响 0 行，数据库保留 B 的结果。

## 判读

- `evidence/redlock.txt` 必须同时出现 `expiry: old token=... new token=...`、`without fencing: stale writer overwrites`、`with fencing: stale token 1 rejected`。
- 续租只能降低概率，不能消除暂停；最终一致性要靠存储端的单调 token 拦截。

## 边界

“进程暂停”是用 `setTimeout` 模拟的，不是真实 STW；Redis 与进程在同一台机器，未覆盖网络分区与时钟漂移。
