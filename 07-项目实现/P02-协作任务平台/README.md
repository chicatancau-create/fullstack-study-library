# P02 协作任务平台

> MS1 实现仓库。Fastify 5 + Prisma 6 + PostgreSQL 18 + JWT（access + refresh）+ Vitest。
> 学习证据以 `npm run evidence` 现场生成，不手抄。

## 目标与能力

- 工作区、任务、评论三类实体；工作区成员以 Membership 记录。
- 对象级授权：非成员访问任务/评论/工作区一律 403。
- 同一工作区同一 Owner 同时只能有一个 `in_progress` 任务，由 PostgreSQL partial unique index 裁决。
- 事务失败回滚：`/workspaces/:id/transaction-demo` 在事务内注入异常，验证无残留行。
- 迁移与回滚：`prisma/migrations/` + `prisma/migrations/.../down.sql`。

## 架构

```text
HTTP (Fastify)
  ├─ @fastify/jwt：access token 15m
  ├─ RefreshToken 表：refresh token 只存 SHA-256，刷新即轮换
  ├─ Membership：workspace × user 唯一，role = owner/admin/member
  └─ Prisma → PostgreSQL
       ├─ Task：workspace_id + status 索引
       └─ partial unique index: (workspaceId, ownerId) WHERE status='in_progress'
```

## 启动

```bash
# 1) 本地 PostgreSQL 18，创建合成库（勿用真实凭据）
createdb -h 127.0.0.1 -U study study_lab_p02ms1

# 2) 安装与迁移
npm ci
export DATABASE_URL='postgresql://study:study-pass@127.0.0.1:5432/study_lab_p02ms1?schema=public'
npx prisma generate
npx prisma migrate deploy

# 3) 启动
npm start   # http://127.0.0.1:3102，OpenAPI: /openapi.json
```

一键起依赖（需 Docker）：

```bash
docker compose up --build
# API：http://127.0.0.1:3102  前端：http://127.0.0.1:8080
```

> 已在隔离 Ubuntu 虚拟机实际执行 `docker compose up --build`：db healthy、app 启动后
> `GET /openapi.json` 返回 200。用 `bash scripts/deploy-evidence.sh` 复跑并生成
> `evidence/deploy.txt`；Windows 本机无 Docker 时用本地 PostgreSQL + `npm run dev`，
> CI 用 PostgreSQL service 验证迁移、测试、覆盖率、前端构建与 E2E。

## 测试与证据

```bash
export DATABASE_URL='postgresql://study:study-pass@127.0.0.1:5432/study_lab_p02_e2e?schema=public&connection_limit=20'
npm run lint      # ESLint，0 warning
npm test          # 38 用例：单元 / 认证 / 主路径 / 跨角色矩阵 / 并发 / 回滚 / 契约
npm run coverage  # 行/函数 ≥80%，policies ≥90%，输出 lcov + json-summary
npm run build     # node --check 全部 src
npm run e2e       # Playwright（本机用 Edge，CI 用 Chromium）
node scripts/perf.mjs        # 普通/峰值两档压测 → evidence/perf-*.json
node scripts/fault-drills.mjs # DB 不可用/恢复/迁移失败/重启/备份恢复
npm run evidence  # 迁移、测试、契约、并发、回滚演练 → evidence/
```

| 证据 | 内容 |
| --- | --- |
| `evidence/test_run.txt` | Vitest 全部用例 |
| `evidence/api_contract.txt` | OpenAPI 关键路径存在性 |
| `evidence/concurrency.txt` | 同一 Owner 并发创建，[201, 409] |
| `evidence/migration_rollback.txt` | down.sql 删表后 `migrate deploy` 恢复 |
| `evidence/deploy.txt` | 隔离 VM 上真实 `docker compose up`：compose ps、OpenAPI 200、app 日志 |
| `evidence/e2e.txt` | Playwright 核心路径 + 空表单校验，`2 passed` |
| `evidence/perf-normal.json` / `perf-peak.json` | 20/50 并发的 QPS、P50/P95/P99、错误率、DB 连接数 |
| `evidence/fault-drills.json` | DB 不可用、恢复后写入、进程重启、迁移失败、备份恢复计数一致 |
| `coverage/lcov.info` | V8 覆盖率，总量与 policies 门槛 |
| `evidence/p02-backup.sql` | `pg_dump` 备份，恢复库计数核对 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` | 注册，返回 access + refresh |
| POST | `/auth/login` | 登录 |
| POST | `/auth/refresh` | 原子轮换 refresh，旧 token 立即失效 |
| GET | `/tasks/:id` | 任务详情（需成员） |
| GET | `/health` `/ready` `/metrics` | 存活、就绪、Prometheus 文本指标 |
| POST/GET | `/workspaces` | 创建工作区 / 列出我的工作区 |
| POST/GET | `/workspaces/:id/tasks` | 创建 / 列出任务（非成员 403） |
| PATCH | `/tasks/:id` | 改状态（版本号 +1） |
| POST/GET | `/tasks/:id/comments` | 评论（非成员 403） |
| POST | `/workspaces/:id/transaction-demo` | 回滚演练 |

## 边界

- 无前端；Prisma 只用于 PostgreSQL，不提供 SQLite 降级。
- JWT secret 由环境变量提供；示例值仅用于本地/CI。
- 未实现邀请流、分页、限流与审计表；这些属于后续 MS。
