# 场景 02：DB 已提交、relay 崩溃在发布之前

## 触发条件

订单与 outbox 在同一事务提交，relay 读取 pending 后、发布前进程退出（关闭连接且不更新 `published`）。

## 观察到的现象

- 提交后 pending=1。
- relay 重启后重新读取 `published=false` 的行并发布，再置为已发布。
- 消息被消费一次，pending 归 0。

这证明 Outbox 把“数据库提交”和“消息发布”拆成两段，崩溃只造成**重复发布**，不会丢事件；消费端用 inbox/幂等键吸收重复。

## 判读

- `evidence/crash-windows.txt` 必须出现 `pending_before=1 pending_after=0 delivered=1`。
- 若 pending_after 仍为 1，说明 relay 没扫描 pending；若为 0 但没有消息，说明只标记未发布。

## 边界

单 relay、轮询式扫描；未覆盖多 relay 抢占、清理与归档。
