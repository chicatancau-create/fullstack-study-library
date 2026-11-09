# 07-项目实现（索引）

> 本目录**不再存放代码**。这里只记录"实现在哪里"，避免同一份代码在笔记库和代码仓库各存一份。
> 早期这里曾是 MS1 交付区；P02/P03/P04 的实现已于 2026-11-08 合并回代码仓库并删除本地副本。

## 代码位置

所有可运行项目都在 `E:\fullstack-code`（GitHub + GitCode 双远端）：

| 项目 | 代码目录 | 实现要点 |
| --- | --- | --- |
| P02 协作任务平台 | `projects/project02-collab` | Fastify 5 + Prisma 6 + PostgreSQL 18 + JWT（access+refresh）+ Vitest + Playwright；前端在 `web/` |
| P03 电商交易 Demo | `projects/project03-trade` | Fastify 5 + PostgreSQL 18 + RabbitMQ 4（Outbox/Inbox/DLQ/对账）+ node:test |
| P04 综合 SaaS | `projects/project04-saas` | Fastify 5 + PostgreSQL 18 + Redis 7 + OTel + React 19 + Playwright |

同一批项目的其他变体也在同一仓库：`projects/project02-frameworks`（Express/NestJS 对照）、`projects/project02-spring`（Spring Boot/MySQL 跨栈），P01 在 `Web/project01-blog`。

## MS6 完整版状态（2026-11-09）

| 项目 | 本机验证 | 证据（`E:\fullstack-code` 内） | 未验证边界 |
| --- | --- | --- | --- |
| P02 | 38/38 测试、前端 10/10、E2E 2/2、覆盖率 96.61/85.07/97.29 | `projects/project02-collab/evidence/` | compose 未在本机复跑（Windows 无 Docker） |
| P03 | 31/31 测试、覆盖率 84.09/80.33/82.93、E2E 1/1、100 并发双锁、MQ/故障演练 | `projects/project03-trade/evidence/` | compose 前端/worker 拓扑已写入，未在本机实跑；依赖审计受 npmmirror 限制 |
| P04 | 30/30 测试、覆盖率 96.59/80.00/100.00、E2E 2/2、ESLint 0 告警、SIGTERM/SSE 自动化、容量扩容路径实测、RBAC/审计/RLS/调度证据 | `projects/project04-saas/evidence/` | compose 未在本机实跑；CI 门禁已写入，受 Actions 计费阻断未实跑 |

三套项目均有 `evidence/manifest.json`；入口脚本不统一：P02 用 `npm run evidence`（`bash scripts/evidence.sh`），P03/P04 用 `bash scripts/run_project.sh`（P02 该文件不存在，P03/P04 也没有 `evidence` script）。数字以脚本现场输出为准，不手改 evidence。

## 验收口径

- 代码：`src/` 可启动，测试覆盖主路径与失败路径。
- 证据：按上表入口脚本现场生成（P02 `npm run evidence`；P03/P04 `bash scripts/run_project.sh`），不手改 `evidence/*.txt`。
- 部署：`docker-compose.yml` + `scripts/deploy-evidence.sh`；Windows 宿主机无 Docker 时只做静态检查。
- 状态只按实际证据更新，见 [[../03-执行计划/进度看板|进度看板]] 与 [[../02-项目实战/README|项目实战索引]]。

## 历史

- 2026-11-08：P02/P03/P04 副本（含依赖，约 760 MB）已并入 `E:\fullstack-code`，本地副本删除。
  项目内的 `.github/workflows/` 未并入（本仓库以根目录 CI 为准）；
  P02 由 pg/node:test 版换成了 Prisma/Vitest 版（旧实现与旧 docs 在归档里）。
  归档位置：`D:\_recover\07-merge-20261109-094019\`。
