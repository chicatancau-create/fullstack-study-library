# ADR 003：事务内 Outbox + 消费端 Inbox 去重

## 状态

已采纳（2026-11-07）

## 背景

订单支付成功后需要通知下游。候选：在支付事务里直接 `channel.publish`；事务提交后用后台任务扫描；
事务内写 outbox，再由发布器投递。

## 决策

支付成功时在**同一事务**写入 `p03.outbox`（主键 `event_id`）；`scripts/mq_check.mjs` 中的发布器
读取 pending 行，持久化投递到 durable exchange `p03.events`，成功后标记 sent。消费者写
`p03.notifications`（`event_id` 主键）实现幂等，处理失败 `nack(requeue=false)` 进入 DLQ。

## 原因

- 直接在事务中 publish 会在提交失败时产生“下游已收到但订单未支付”的幽灵事件。
- 纯后台扫描无法保证业务写入与事件意图原子一致；outbox 把两者放进同一事务。
- 消费端用唯一主键去重，重复投递不会重复副作用。

## 代价

- 发布器“先 publish 后标记 sent”存在崩溃窗口，可能重复投递；由消费端幂等兜底。
- outbox 需要清理/归档；当前未实现。
- 单节点、无重试退避；持续失败会依赖 DLQ 人工处理，未做重放工具。
- 未实现积压告警，只验证了 30 条积压可排空。

## 回滚

若改为 CDC/Debezium，保留 outbox 作为事实来源；消费者契约不变。
