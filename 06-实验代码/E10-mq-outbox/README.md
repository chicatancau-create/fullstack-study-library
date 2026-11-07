# E10：RabbitMQ Outbox、幂等消费、重投与 DLQ

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E10。
> 本实验在**真实 RabbitMQ 4.4.0 + PostgreSQL 18.6** 上验证 Outbox、重复投递、消费后崩溃重投、inbox 去重、DLQ 与对账；不覆盖集群/积压/重放。
> 环境：Windows 10.0.28000 + Node v24.15.0 + RabbitMQ 4.4.0 + Erlang 29.1.2 + PostgreSQL 18.6

## 1. 做了什么、没做什么

做了什么：

- 订单 + Outbox 在同一 PostgreSQL 事务提交；Outbox 行带 `event_id UNIQUE`。
- 发布后“崩溃”：未标记 `published` 就断开 channel/connection；重连后再发布一次，形成重复投递，然后标记 published。
- 消费者 A：应用副作用 + 写 inbox 后、ack 前关闭 channel（模拟崩溃），消息被 broker 重投。
- 消费者 B：收到重复消息，inbox 主键冲突 → 不重复副作用，ack。
- 非法消息：`nack(requeue=false)` → 经 DLX 进入 `e10.dlq`。
- 对账：orders=1、outbox=1、inbox=1、side_effects=1、queue=0、dlq=1。
- 队列/交换机 durable，消息 persistent；RabbitMQ 4.4 拒绝非持久队列。

没做什么：

- 单节点 RabbitMQ；没有 quorum queue/镜像/集群/网络分区。
- 没有积压/重放/顺序保证/消费者预取调优；没有压力测试。
- 没有真实业务下游；副作用是 PG 表写入。
- 没有 Outbox 清理/归档策略；没有对账任务定时化。
- 没有把实验接进项目 03/04。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 订单与 Outbox 同事务提交，二者都存在 | 事务后查两表 | **成立**：orders=1、outbox=1 |
| H2 | 发布后未标记就崩溃，会重复发布 | 断开后重连再发 | **成立**：队列收到两条同 event_id |
| H3 | 消费后、ack 前崩溃会重投；inbox 唯一键阻止重复副作用 | 关闭 channel 不 ack，再消费 | **成立**：first=applied、second=duplicate、side_effects=1 |
| H4 | 非法消息 nack 后可进 DLQ | nack(requeue=false) + checkQueue | **成立**：queue=0、dlq=1 |
| H5 | 对账计数一致 | 统计四表/两队列 | **成立**：1/1/1/1/0/1 |

## 3. 环境

```text
OS        : Windows 10.0.28000 x64
Node      : v24.15.0
RabbitMQ  : 4.4.0（D:\RabbitMQ\rabbitmq_server-4.4.0，127.0.0.1:5672）
Erlang    : 29.1.2（D:\Erlang）
PostgreSQL: 18.6（study_lab，schema e10）
客户端    : amqplib 2.2.1、pg 8.23.1
凭据      : RabbitMQ 本地 guest/guest；PG 只从 PGPASSWORD 读取
```

## 4. 执行命令

```bash
cd 06-实验代码/E10-mq-outbox
npm ci
PGPASSWORD=<local-test-password> bash scripts/run_evidence.sh
echo $?
```

## 5. 关键流程

```text
BEGIN; INSERT orders; INSERT outbox(event_id); COMMIT;
publish(outbox) -> crash before UPDATE published=true
reconnect -> publish(same) -> UPDATE published=true
consume m1 -> apply(inbox + side_effect) -> close channel without ack
reconnect -> consume m1' -> inbox duplicate -> ack
publish malformed -> nack(requeue=false) -> DLX -> DLQ
reconcile: orders=outbox=inbox=side_effects=1, queue=0, dlq=1
```

## 6. 结果

```text
orders=1 outbox=1 inbox=1 side_effects=1
first=applied second=duplicate
queue=0 dlq=1
RECONCILE PASS
E10 PASS
```

原始 JSON 见 `evidence/result.json`，命令输出见 `evidence/run.txt`。

## 7. 边界

1. 单节点 RabbitMQ；没有集群/quorum/镜像/分区。
2. 没有积压/重放/顺序/预取调优/压力测试。
3. 副作用是 PG 表写入；没有外部 HTTP/支付等不可事务副作用。
4. Outbox 没有清理/归档；inbox 没有保留期策略。
5. 对账是一次脚本，不是定时任务/告警。
6. 同机合成数据；不是生产可靠性证明。

## 8. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M08 分布式语义 | 部分 | Outbox、至少一次、幂等、DLQ、对账 |
| E10 | **本实验** | 单节点；无积压/重放/集群 |
| G5/G7 | 仅子项 | 不代表关口通过 |

## 9. 目录结构

```text
E10-mq-outbox/
├── src/db.mjs            PG schema/reset/count
├── src/broker.mjs        RabbitMQ durable exchange/queue + DLX
├── src/experiment.mjs    Outbox/重复/崩溃/DLQ/对账
├── scripts/run_evidence.sh
├── evidence/             run.txt / result.json / result.txt
└── package.json / package-lock.json
```