# 项目 04：多租户客户跟进 SaaS

> MS1 实现仓库（2026-11-08 迁入资料库并在本机复跑，另补 Redis 登录令牌桶）。
> **MS6 完整版（2026-11-09）**：四角色 RBAC、审计 before/after/request_id、提醒 Job + 公平调度/重试死信、
> React 前端 + Playwright E2E、覆盖率门槛、CI 三 job、独立 evidence。当前本机证据：27/27 测试、
> 覆盖率行 96.94% / 分支 81.58% / 函数 100%、E2E 2/2。

一个小型销售团队的组织、成员、客户、跟进与审计闭环。重点是多租户边界、RBAC、
席位不变量与审计同事务，而不是页面数量。

## 技术栈

- Node.js 24 + Fastify 5
- PostgreSQL 18（schema `p04`，真实数据库）
- Redis 7（登录令牌桶限流）
- node:test + Fastify inject；`pg_dump` / `psql` 备份恢复

## 运行

```bash
export PGHOST=127.0.0.1 PGUSER=study PGDATABASE=study_lab
export PGPASSWORD=study-pass          # 仅本地合成密码
npm ci
npm run migrate
npm test
npm start                             # http://127.0.0.1:8797
```

一键验证（迁移 → 15 个真实 DB/Redis 测试 → 备份恢复 → OTel/后台任务/告警）：

```bash
PGPASSWORD=study-pass bash scripts/run_project.sh
```

## Docker Compose

```bash
docker compose up --build   # PostgreSQL 18 + Redis 7 + app
```

> 已在隔离 Ubuntu 虚拟机实际执行 `docker compose up --build`：db 与 Redis healthy、
> app 启动后 `GET /health` 返回 200、`/metrics` 有输出。用 `bash scripts/deploy-evidence.sh`
> 复跑并生成 `evidence/deploy.txt`；Windows 本机无 Docker，本机功能证据来自原生 PostgreSQL 18.6 + Redis 7，CI 用 service 容器跑迁移、测试与 build。

## 已实现

- 注册/登录/登出：scrypt 加盐、不透明令牌只存哈希、12 小时过期。
- 组织：创建者 owner；free=2 席、team=5 席。
- 邀请：owner/admin 发起，pending 占用席位；被邀请邮箱接受；撤销/过期/重放有明确结果。
- 成员：列表、移除；不能移除 owner 或自己。
- 套餐：owner 变更；成员 + pending 超过新席位时 409（需求变更演练项）。
- 客户与跟进：租户隔离；客户软删除；删除后不能写跟进。
- 审计：邀请、接受、撤销、移除成员、套餐、删除客户；同事务；仅 admin+ 可见。
- 迁移记录、备份恢复到独立库并核对行数。

## 证据（本机真实 PostgreSQL 18.6）

- [evidence/test.txt](evidence/test.txt)：历史 15 项测试记录（MS1）。
- [evidence/migrate.txt](evidence/migrate.txt)：9 张表（含迁移记录）。
- [evidence/backup.txt](evidence/backup.txt)：`tenants/memberships/audit` 恢复前后一致。
- [evidence/run.txt](evidence/run.txt)：本轮时间与 PASS 汇总。
- [evidence/rbac.txt](evidence/rbac.txt)：5 角色 × 10 端点 × 双租户共 50 个组合，期望不符 0。
- [evidence/audit_log.txt](evidence/audit_log.txt)：8 条真实审计，含 before/after/request_id/actor。
- [evidence/multi_tenant.txt](evidence/multi_tenant.txt)：跨租户 404、未登录 401、RLS 策略与 owner 绕过说明。
- [evidence/workers-load.txt](evidence/workers-load.txt)：200 任务吞吐/延迟/公平性/重试死信/容量三档/DB 故障。
- [evidence/jobs.txt](evidence/jobs.txt)：重复入队幂等、通知与 Inbox 计数、dead letter。

## 完整版验证命令

```bash
export PGHOST=127.0.0.1 PGUSER=study PGDATABASE=study_lab PGPASSWORD=study-pass
npm run migrate
npm run lint
npm run coverage          # 27 tests；行 96.94 / 分支 81.58 / 函数 100
npm run rbac:evidence
npm run audit:evidence
npm run workers:load
node scripts/jobs_check.mjs
npm run build --prefix web
npm run e2e               # Playwright 2/2（本机 msedge）
```

## 文档

- [需求与变更演练](docs/requirements.md)
- [权限矩阵](docs/permissions.md)
- [架构与 ER](docs/architecture.md)
- [追踪表](docs/tracking.md)
- [数据清单](docs/data-inventory.md)
- [运行手册](docs/runbook.md)
- [OpenAPI](docs/openapi.yaml)
- ADR：[认证](docs/adr/001-auth-sessions.md)、[租户隔离](docs/adr/002-tenant-isolation.md)、
  [审计事务](docs/adr/003-audit-transaction.md)
- [Bug 复盘](docs/bugs/001-stale-invite-idempotency.md)、[审查记录](docs/review.md)

## 已知限制（未验证）

- 无邮件发送，邀请 token 只在创建响应出现一次；通知通道为 SSE（前端当前用轮询展示）。
- 仍无 MFA、密码重置、自助删号。
- 已有 Docker/Compose、GitHub Actions、K8s 两节点（同 VM）、Traefik Ingress、本地 HTTPS、Prometheus/Alertmanager 本地+ntfy 外部告警；无多机/HA/公网入口，项目本身未做持久公网部署。
- 审计与客户列表无分页；`sessions` 过期行无清理任务。
- SSE 通道已实现但本机自动验证未完成（`evidence/workers-load.txt` 已标注“未证实”）；Windows 下无法实测 SIGTERM 优雅关闭。
- RLS 已启用，但 `study` 角色是表 owner，默认绕过 RLS；跨租户隔离由应用层 `roleIn` + `tenant_id` 保证（证据见 `multi_tenant.txt`）。
- 备份不支持按用户删除；软删除数据仍留在库中。

## AI 辅助范围

AI 参与实现、测试与文档初稿；结论以本仓库脚本实际输出为准。未验证项已在上方列出。
