# 07-项目实现

> MS1 交付区：与 `06-实验代码/` 平级的可运行项目实现。每个项目自带源码、测试、CI、Docker Compose 与现场生成的 `evidence/`。

| 项目 | 状态 | 技术栈 | 入口 |
| --- | --- | --- | --- |
| P02 协作任务平台 | ✅ 可运行（本机 PostgreSQL 实测） | Fastify 5 + Prisma 6 + PostgreSQL 18 + Vitest | [P02-协作任务平台](P02-协作任务平台/README.md) |
| P03 电商交易 Demo | ✅ 可运行（本机 PostgreSQL 18.6 + RabbitMQ 实测） | Fastify 5 + PostgreSQL 18 + RabbitMQ 4 + node:test | [P03-电商交易Demo](P03-电商交易Demo/README.md) |
| P04 综合 SaaS | ⬜ 待建设 | 计划：多租户 + RBAC + 审计 + 深度模块 | — |

## 验收口径

- 代码：`src/` 可启动，测试覆盖主路径与失败路径。
- 证据：`npm run evidence` 现场生成，不手改 `evidence/*.txt`。
- 部署：提供 `docker-compose.yml`；本机无 Docker 时只做静态检查，并在证据里写明边界。
- 状态只按实际证据更新；P03/P04 未建设前不勾选。
