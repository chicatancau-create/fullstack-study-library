# 项目 03：电商交易 Demo

> MS1 实现仓库（2026-11-08 迁入资料库并在本机复跑）。证据由 `scripts/run_project.sh` 现场生成。

在项目 02 的基础上独立演进的最小交易闭环：下单 → 冻结库存 → 取消回补 / 支付成功。
重点是**并发正确性**而不是页面数量：库存不为负、金额由服务端计算、订单快照不随商品修改、
幂等重试不重复下单、支付回调可重复投递、取消与支付竞争有确定终态。

## 技术栈

- Node.js 24 + Fastify 5
- PostgreSQL 18（schema `p03`，真实数据库，无内存替身）
- node:test + Fastify inject，`pg_dump` / `psql` 备份恢复

## 运行

需要本地 PostgreSQL 与 RabbitMQ（`127.0.0.1:5672`，guest/guest，合成数据），并设置 PostgreSQL 合成账号密码：

```bash
export PGHOST=127.0.0.1 PGUSER=study PGDATABASE=study_lab
export PGPASSWORD=study-pass          # 仅本地合成密码
npm install
npm run migrate
npm test
npm start                             # http://127.0.0.1:8796
```

一键验证（迁移 → 测试 → 并发压测 → 备份恢复）：

```bash
PGPASSWORD=study-pass bash scripts/run_project.sh
```

Windows 下备份脚本默认使用 `D:/PostgreSQL/18/bin`，可用 `PG_BIN` 覆盖。

## Docker Compose

```bash
docker compose up --build   # PostgreSQL 18 + RabbitMQ 4 + app + web
# API：http://127.0.0.1:8796  前端：http://127.0.0.1:8081
```

> 已在隔离 Ubuntu 虚拟机实际执行 `docker compose up --build`：db 与 RabbitMQ healthy、
> app 启动后 `GET /health` 返回 200。用 `bash scripts/deploy-evidence.sh` 复跑并生成
> `evidence/deploy.txt`；Windows 本机无 Docker，本机功能证据来自原生 PostgreSQL 18.6 + RabbitMQ，CI 用 service 容器跑迁移、测试与 build。
>
> 栈约定中的 Redis 在本实现未使用；库存并发控制由 PostgreSQL 行锁/条件更新完成，未用缓存替身冒充。

## API 摘要

完整契约见 [docs/openapi.yaml](docs/openapi.yaml)。业务接口要求 `x-api-key` 与 `x-user-id`；
Demo 中用户身份由网关头模拟，生产必须从认证令牌解析。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/orders` | 创建订单，要求 `Idempotency-Key`，返回服务端金额与快照 |
| GET | `/orders/:id` | 仅本人可见 |
| POST | `/orders/:id/cancel` | 仅 `pending_payment` 可取消，回补库存，重复取消幂等 |
| POST | `/orders/:id/pay` | Mock Gateway 支付；成功推进 `paid` 并写 Outbox |
| POST | `/orders/:id/ship` | `paid` → `shipped` |
| POST | `/orders/:id/complete` | `shipped` → `completed` |
| POST | `/orders/:id/refund` | `paid/shipped/completed` → `refunding` → `refunded`；仅支付后未发货回补库存 |
| GET | `/orders/:id/audit` | 该订单审计链（actor/action/request_id/before/after） |
| GET | `/products` `/ready` `/metrics` | 商品、就绪、指标 |
| POST | `/payments/callback` | HMAC-SHA256 签名，`event_id` 去重，状态机推进 |
| GET | `/health` | 健康检查 |

## 完整版能力

- 七态状态机：`pending_payment / paid / shipped / completed / cancelled / refunding / refunded`，7×7 迁移矩阵测试。
- 双锁对照：`LOCK_STRATEGY=row|optimistic`，同一 100 并发抢 10 件套件跑两遍。
- 前端 + Playwright：下单→支付→发货→完成→退款全链路。
- Worker：Outbox 轮询、Inbox 去重、失败退避、5 次后 dead；设置 `AMQP_URL` 时投递 RabbitMQ。
- 审计：所有写操作写 `p03.audit_log`（before/after/request_id）。
- OWASP：见 [docs/owasp-matrix.md](docs/owasp-matrix.md)。

```bash
export PGPASSWORD=study-pass PGDATABASE=study_lab
node scripts/migrate.mjs
npm test                 # 24 用例（含 7×7 状态机、双锁 100 并发、Worker、OWASP）
npm run coverage         # 行 ≥80%、分支 ≥75%、函数 ≥80%
npm run e2e              # Playwright 全链路
npm run load:locks       # 双锁 100 并发原始数据 → evidence/load-locks.json
```

## 关键决策

- [ADR 001：库存行锁 + 条件更新](docs/adr/001-inventory-locking.md)
- [ADR 002：支付回调 event_id 去重 + 状态机](docs/adr/002-payment-idempotency.md)
- [ADR 003：事务内 Outbox + 消费端 Inbox 去重](docs/adr/003-outbox-inbox.md)

## 支付事件（真实 RabbitMQ）

- 支付成功与 `p03.outbox` 写入在同一数据库事务；发布器投递 durable exchange `p03.events`。
- 消费端以 `event_id` 为 `p03.notifications` 主键，重复投递只产生一条通知。
- 处理失败 `nack(requeue=false)`，经 `p03.dlx` 进入 `p03.dlq`。
- 已验证：重复投递不重复写、30 条积压可排空、DLQ 收到 1 条、outbox sent 与通知对账 missing=0。
- 证据：[evidence/mq.txt](evidence/mq.txt)。

## 数据模型

- `p03.inventory`：SKU、标题、单价（分）、库存，`CHECK (stock >= 0)`。
- `p03.orders`：`(user_id, idem_key)` 唯一，保存请求指纹、下单时单价与总额、状态机。
- `p03.order_items`：下单时商品标题/单价快照。
- `p03.payment_events`：支付事件唯一表，记录是否应用及原因。

## 验证证据

全部由 `scripts/run_project.sh` 在本机真实 PostgreSQL 上生成：

- [evidence/test.txt](evidence/test.txt)：15/15 通过（含并发幂等、取消/支付竞争）。
- [evidence/load.txt](evidence/load.txt)：20 并发 × 240 请求，成功 150、库存不足 90、其他 0；
  P50 32.2ms / P95 96.3ms / P99 634.3ms；最终库存 0、订单 150。
- [evidence/migrate.txt](evidence/migrate.txt)、[evidence/backup.txt](evidence/backup.txt)：迁移与备份恢复行数一致。
- [evidence/bug-001-failure.txt](evidence/bug-001-failure.txt)：修复前的超时原始输出。
- [evidence/mq.txt](evidence/mq.txt)：真实 RabbitMQ 的 outbox/幂等/DLQ/积压/对账结果。
- [docs/bugs/001-pool-starvation.md](docs/bugs/001-pool-starvation.md)：真实 Bug 复盘。

## 已知限制（未验证）

- 只支持单 SKU 订单；多商品、优惠、税费未实现。
- 没有真实支付网关，回调由测试用 HMAC 签名模拟；未验证网关重试节奏与原始报文验签。
- 没有订单超时自动取消、退款与对账。
- MQ 只验证单节点、单消费者；未验证发布器崩溃窗口、消费者处理中崩溃重投、DLQ 重放、积压告警与多实例竞争。
- 压测是单机、回环网络、合成数据；数字不代表生产容量。
- 备份恢复验证到独立数据库 `p03_restore_check`，未做时间点恢复（PITR）。

## AI 辅助范围

AI 参与代码生成、测试设计与文档初稿；接口行为、并发结论以本仓库脚本实际输出为准。
所有数字均可在 `evidence/` 中复核，未验证项已在上面列出。
