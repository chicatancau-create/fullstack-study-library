# 场景 01：先发消息再回滚，幻影消息无法撤回

## 触发条件

事务内插入订单，直接在事务里 `publish`，然后 `ROLLBACK`。

## 观察到的现象

- 消息已经进入 RabbitMQ（`message=published`）。
- 订单行数为 0（`order_rows=0`）。
- 消费者会为一条不存在的订单触发下游动作——这就是幻影消息。

换 Outbox：订单与 outbox 行同事务写入；回滚后 outbox 行也是 0，relay 没有可发布的事件。

## 判读

- `evidence/crash-windows.txt` 必须同时出现 `message=published order_rows=0` 和 `rolled-back event invisible`。
- 只看“回滚成功”不能证明消息没发出去。

## 边界

单节点 RabbitMQ、单通道；未覆盖 publisher confirm 丢失与 broker 侧去重。
