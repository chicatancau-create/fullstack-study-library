# 架构与数据模型

## 上下文

```text
浏览器/脚本 ──HTTPS(本地 HTTP)──> Fastify API ──SQL──> PostgreSQL 18 (schema p04)
                                      │
                                      └── 结构化日志 / 请求 ID（stdout）
```

单进程、单数据库；没有缓存、队列、对象存储与第三方通知。选择理由见 ADR 002。

## 组件

- `src/app.js`：路由、鉴权、RBAC、事务与审计；无 ORM，SQL 显式。
- `src/db.mjs`：连接池配置（`PGPASSWORD` 必须由环境提供）。
- `migrations/001_init.sql`：8 张业务表 + 迁移记录表。
- `scripts/`：迁移、备份恢复、一键验证、证据 manifest。

## ER

```text
users 1─* sessions
users 1─* memberships *─1 tenants
tenants 1─* invitations
tenants 1─* clients 1─* followups
tenants 1─* audit_events
```

## 核心 API

| 方法 | 路径 | 角色 |
| --- | --- | --- |
| POST | `/auth/register`、`/auth/login`、`/auth/logout` | 公开/登录 |
| POST/GET | `/tenants` | 登录 |
| PATCH | `/tenants/:id/plan` | owner |
| GET | `/tenants/:id/members` | 成员 |
| DELETE | `/tenants/:id/members/:userId` | owner/admin |
| POST | `/tenants/:id/invitations` | owner/admin |
| POST | `/invitations/accept`、`/invitations/:id/revoke` | 登录/owner·admin |
| POST/GET | `/tenants/:id/clients` | 成员 |
| DELETE | `/tenants/:id/clients/:clientId` | owner/admin |
| POST | `/tenants/:id/clients/:clientId/followups` | 成员 |
| GET | `/tenants/:id/audit` | owner/admin |

完整契约见 [openapi.yaml](openapi.yaml)。

## 关键失败路径

- 数据库不可用：请求返回 500 + `request_id`，不返回 SQL 细节；进程不崩溃。
- 审计写入失败：业务事务回滚（已用触发器注入验证）。
- 并发邀请：租户行锁串行化，超出席位返回 409。
- 旧邀请重放：已接受但成员被移除时返回 409，不恢复成员。
