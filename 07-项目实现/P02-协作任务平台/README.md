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
```

> 本机（Windows，无 Docker）只验证了 `docker compose config`，未实际执行 `up`；CI 用 PostgreSQL service 验证迁移与测试。该边界写在 `evidence/deploy.txt`。

## 测试与证据

```bash
export DATABASE_URL='postgresql://study:study-pass@127.0.0.1:5432/study_lab_p02ms1?schema=public'
npm test          # 6 组：认证 / 主路径 / 越权 / Owner 并发 / 事务回滚 / OpenAPI
npm run build     # node --check 全部 src
npm run evidence  # 迁移、测试、契约、并发、回滚演练 → evidence/
```

| 证据 | 内容 |
| --- | --- |
| `evidence/test_run.txt` | Vitest 全部用例 |
| `evidence/api_contract.txt` | OpenAPI 关键路径存在性 |
| `evidence/concurrency.txt` | 同一 Owner 并发创建，[201, 409] |
| `evidence/migration_rollback.txt` | down.sql 删表后 `migrate deploy` 恢复 |
| `evidence/deploy.txt` | compose 静态检查或“无 Docker”边界说明 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` | 注册，返回 access + refresh |
| POST | `/auth/login` | 登录 |
| POST | `/auth/refresh` | 轮换 refresh，旧 token 立即失效 |
| POST/GET | `/workspaces` | 创建工作区 / 列出我的工作区 |
| POST/GET | `/workspaces/:id/tasks` | 创建 / 列出任务（非成员 403） |
| PATCH | `/tasks/:id` | 改状态（版本号 +1） |
| POST/GET | `/tasks/:id/comments` | 评论（非成员 403） |
| POST | `/workspaces/:id/transaction-demo` | 回滚演练 |

## 边界

- 无前端；Prisma 只用于 PostgreSQL，不提供 SQLite 降级。
- JWT secret 由环境变量提供；示例值仅用于本地/CI。
- 未实现邀请流、分页、限流与审计表；这些属于后续 MS。
