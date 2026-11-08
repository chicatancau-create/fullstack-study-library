# MS1 · 主线项目实现仓库

> 目标：把 `02-项目实战/` 的 5 个项目中，至少 P02/P03/P04 做成**真实可运行**的实现仓库。
> 工作量：周级。优先级：P0。

## 全局规则

1. 在仓库根新建 `07-项目实现/` 目录，与 `06-实验代码/` 平级。
2. 每个项目目录结构统一：
   ```
   07-项目实现/PXX-项目名/
   ├── README.md            # 项目说明、架构图、启动方式
   ├── docker-compose.yml   # 一键起所有依赖
   ├── .github/workflows/ci.yml
   ├── src/                 # 源码
   ├── tests/               # 单元 + 集成 + E2E
   ├── scripts/             # 启动/迁移/压测/故障注入
   └── evidence/            # 构建日志、测试输出、性能数据、故障演练
   ```
3. 技术栈严格遵守 `000-学习总览.md` 默认主栈：React + Vite / Fastify / PostgreSQL + Prisma / Redis / Vitest / Playwright / Docker Compose。
4. **必须有证据**：每个项目跑通后，把 `npm run test`、`npm run build`、压测、故障演练输出存到 `evidence/`。
5. 提交格式：`feat(P02): MS1-协作任务平台初版` 等。

---

## P02 协作任务平台

对应：`02-项目实战/项目02-协作任务平台.md`。

### 必须实现
- 工作区（workspace）、任务（task）、评论（comment）三类实体
- JWT 认证（access + refresh）
- 对象级授权：跨租户访问一律 403
- Owner 并发唯一约束：同一工作区同一 Owner 同时只能有一个进行中任务（DB 层 partial unique index）
- 事务失败回滚：故意构造失败，验证数据一致
- 迁移与回滚：Prisma migrate + 回滚脚本

### 必须测试
- 单元：服务层、工具函数
- 集成：API 契约（OpenAPI 校验）
- 越权：跨租户、跨角色
- 并发：同一 Owner 并发创建（应只成功一个）
- 事务：构造失败，验证回滚

### 必须证据
- `evidence/build.txt`：构建成功
- `evidence/test_run.txt`：全部测试通过
- `evidence/api_contract.txt`：OpenAPI 契约校验
- `evidence/concurrency.txt`：Owner 并发测试
- `evidence/migration_rollback.txt`：迁移回滚演练
- `evidence/deploy.txt`：docker-compose 启动成功

---

## P03 电商交易 Demo

对应：`02-项目实战/项目03-电商交易Demo.md`。

### 必须实现
- 商品、库存、订单、支付四张表
- 库存扣减：DB 行锁 + 乐观锁两种实现，对比
- 订单状态机：待支付/已支付/已发货/已完成/已取消/退款中/已退款
- 幂等键：客户端传入，DB 唯一约束
- 重复回调：模拟支付网关重复回调，验证只处理一次
- 模拟支付：内置 mock gateway，可配置延迟/失败率

### 必须测试
- 单元：状态机全路径
- 集成：下单-支付-发货-完成全流程
- 并发扣减：100 并发抢 10 件库存，验证不超卖
- 幂等：同一幂等键重复提交返回相同订单
- 重复回调：mock gateway 重发回调，验证只处理一次
- OWASP A01–A10：越权、注入、XSS、SSRF、反序列化等
- 性能：P50/P95/P99 延迟、QPS

### 必须证据
- `evidence/build.txt`
- `evidence/test_run.txt`
- `evidence/state_machine.txt`：状态机全路径覆盖
- `evidence/concurrency_stock.txt`：并发扣减
- `evidence/idempotency.txt`：幂等测试
- `evidence/owasp.txt`：OWASP 测试
- `evidence/performance.txt`：压测报告（含 P50/P95/P99）
- `evidence/fault_inject.txt`：故障注入（DB 挂掉、Redis 挂掉、消息重复）
- `evidence/k8s_deploy.txt`：K8s 部署（可选，用 kind）

---

## P04 综合 SaaS 毕业项目

对应：`02-项目实战/项目04-综合SaaS毕业项目.md`。

### 选题
自选一个真实痛点，写 1 页选题说明（背景/用户/核心场景/非目标）。

### 必须实现
- 多租户：tenant_id 字段 + 行级隔离
- RBAC：至少 admin/member/viewer 三种角色
- 审计日志：所有写操作记录 who/when/what/before/after
- 完整 CI/CD：lint + test + build + deploy
- 四选一深度模块（**推荐选"高并发交易"或"RAG/Agent"**）：

#### 选项 A：高并发交易/预约
- 热点竞争：DB 行锁 / Redis 分布式锁 / 队列串行化，三选一
- 幂等：DB 唯一约束
- 限流：令牌桶
- 一致性实验：故障注入验证
- 容量估算：普通/峰值/超容量三档负载

#### 选项 B：RAG/Agent
- 混合检索：向量 + 全文
- 重排：cross-encoder
- 引用：每条答案必须可追溯到原文
- 工具权限：Agent 调用外部工具需鉴权
- golden set：见 MS4

### 必须证据
- 同 P02/P03，另加：
- `evidence/audit_log.txt`：审计日志完整性
- `evidence/rbac.txt`：三种角色权限矩阵
- `evidence/multi_tenant.txt`：跨租户隔离
- 深度模块专项证据（容量/压测/故障/golden set）

---

## 里程碑验收

- [ ] P02/P03/P04 都有完整源码 + 测试 + CI + evidence
- [ ] 三个项目都能 `docker-compose up` 一键起
- [ ] 所有 evidence 真实生成（不是手抄）
- [ ] README 完整（架构图、启动方式、测试方式）
- [ ] 更新 `000-学习总览.md` 目录导航，补 `07-项目实现/`
- [ ] 更新 `04-资源与评估/项目审计与优化报告.md`，把"项目无实现仓库"标记为已闭合
