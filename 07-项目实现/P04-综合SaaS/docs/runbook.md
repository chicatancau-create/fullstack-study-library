# 运行手册（本地）

## 前置

- Node.js 24、PostgreSQL 18（本机 `D:/PostgreSQL/18/bin`）。
- 环境变量：`PGHOST`、`PGPORT`、`PGUSER`、`PGPASSWORD`、`PGDATABASE=study_lab`。
- 密码只从环境读取，不写入仓库。

## 启动

```bash
npm ci
npm run migrate
npm start          # 127.0.0.1:8797
curl http://127.0.0.1:8797/health
```

## 验证

```bash
PGPASSWORD=<local-test-password> bash scripts/run_project.sh
```

输出：迁移表清单、15 个测试、备份恢复行数对比、`PROJECT04 PASS`。

## 备份与恢复演练

```bash
node scripts/backup.mjs
# 内部：pg_dump --schema=p04 -> createdb p04_restore_check -> psql 恢复 -> 对比行数 -> 删除临时库
```

生产恢复应恢复到新库并切换连接串；本脚本不覆盖正在使用的库。

## 常见故障

| 现象 | 排查 | 处理 |
| --- | --- | --- |
| `缺少 PGPASSWORD` | 环境变量未导出 | 导出本地合成密码后重跑 |
| 连接被拒绝 | `pg_isready -h 127.0.0.1 -p 5432` | 启动 PostgreSQL 服务 |
| 测试 409 seats_full | 席位已满或残留 pending 邀请 | 查 `invitations`，撤销或移除成员 |
| DELETE 客户 500 | 审计写入失败或触发器存在 | 看响应 `request_id` 与服务端日志；确认无测试触发器残留 |
| 测试间数据污染 | 上轮失败未清理 | 测试 `beforeEach` 会 truncate；手工可 truncate p04 表 |

## 回滚

- 代码：`git revert <commit>` 后重新 `npm ci && npm test`。
- 数据库：迁移为前向脚本，无自动 down；回滚需从备份恢复到新库并切换连接串。
- 高风险动作失败时优先回滚业务事务，不做“先成功再补审计”。

## 监控与限制

- 结构化日志（Fastify logger）与 `X-Request-Id`；指标端点 `/metrics`（Prometheus 3.5.0）+ Alertmanager 0.28.1 webhook 告警，已验证 ntfy.sh 外发通道。
- 登录接口已启用令牌桶限流（容量 2，超过返回 429 + Retry-After）。
- 已验证 Docker Compose（run6）、K3s 1.37.2 双节点（server + agent）、Traefik Ingress、HTTPS、滚动发布/回滚；多实例按 K3s agent 节点调度。

## 后台调度深度模块

### 投递与查看

```bash
# owner/admin 投递提醒任务（priority 0-100）
curl -X POST http://127.0.0.1:8797/tenants/1/jobs \
  -H "authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"kind":"reminder","dedupe_key":"demo-1","priority":5,"payload":{"client_id":1}}'
curl http://127.0.0.1:8797/tenants/1/jobs -H "authorization: Bearer <token>"
curl http://127.0.0.1:8797/tenants/1/notifications -H "authorization: Bearer <token>"
curl -N http://127.0.0.1:8797/tenants/1/notifications/stream -H "authorization: Bearer <token>"
```

同租户 + 同 `dedupe_key` 只保留一条；`run_at` 控制到期时间；高 priority 先出，但公平调度保证每个租户先取一条（防单租户饿死其他租户）。

### worker

```bash
WORKER_PORT=8798 node src/worker.js
curl http://127.0.0.1:8798/ready    # DB 不可用时 503
```

worker 每批 `JOB_BATCH=5`，轮询间隔 `JOB_INTERVAL_MS=500`；处理成功写 `job_notifications` 与 `worker_inbox`，reminder 同时把 `reminders.status` 置为 `sent`。

### 积压 / 重试 / DLQ

| 场景 | 观察 | 处理 |
| --- | --- | --- |
| 积压 | `GET /metrics` 的 `p04_jobs_pending` 持续上升 | 增加 worker 或调大 `JOB_BATCH`，先扩容再排障 |
| 失败重试 | `jobs.attempts` 增长，`run_at` 按 2^n 秒回退 | 查 `last_error` 与 `kind`；修复下游后自然重试 |
| 死信 | `jobs.status='dead'`，`job_dead_letter` 有行 | 人工核对 payload 修复后，把 dead 行改回 pending 并清空 run_at |
| worker 卡死 | `locked_at` 长期不变 | 重启 worker；SKIP LOCKED 保证新 worker 不撞行 |
| 通知通道故障 | SSE 无事件但 DB 有 `job_notifications` 行 | 前端可回退轮询 `/notifications`；服务端每 2s 读 DB |
| 对账 | 对比 `jobs(status='done')` 与 `job_notifications`、`worker_inbox` 计数 | 三者应一致；不一致时以 jobs 为准重建通知 |

### 容量估算

`capacityEstimate()` 以提醒量、峰值系数、单任务耗时、worker 并发计算 normal/peak/over 三档；
本机口径见 `evidence/workers-load.txt`。容量不足时先加 worker/并发，再评估 DB 连接与通知通道。
