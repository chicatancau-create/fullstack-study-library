# MS6 · 项目完整版（P02/P03/P04 全范围）

> 目标：把 P02/P03/P04 从"核心子集"补齐为**完整版**，达到 `02-项目实战/` 原始验收标准。
> 定位：**自学项目**，学习者可以对照完整实现学习。
> 前置：MS0–MS5 已完成。

## 全局规则

1. 每个项目必须包含：README + 完整源码 + 单元测试 + 集成测试 + E2E + CI + evidence + 覆盖率报告。
2. 所有 evidence 必须真实生成（跑 scripts），禁止手改。
3. 每个项目必须有 `docker-compose.yml` 一键启动。
4. 提交格式：`feat(P02): MS6-完整版-<子项>`。

---

## P02 协作任务平台 · 完整版

### 当前缺口
- 前端完全未实现（无 React/Vite 应用）
- 无 E2E（无 Playwright）
- 无覆盖率测量
- 无服务层拆分（所有业务集中在 src/app.js）
- 跨角色授权测试不足
- 无性能基线
- 安全：默认 JWT secret、无登录限流、无安全 Header、refresh 轮换有并发重放窗口
- 无可观测性（无请求 ID、指标、Trace）
- 故障演练只有事务内抛错，不是依赖故障

### 必做清单

#### 1. 服务层拆分
- 拆出 `services/`：workspaceService、taskService、commentService、authService
- 拆出 `policies/`：workspacePolicy、taskPolicy、commentPolicy
- 拆出 `utils/`：jwt、password、validation
- 每层独立单元测试

#### 2. 前端实现
- React + Vite + TypeScript
- 页面：登录/注册、工作区列表、工作区详情（任务列表）、任务详情（含评论）
- 状态：加载、空、错误、提交中、403、会话过期
- 路由：React Router
- 表单：受控组件 + 校验
- 测试：Vitest + Testing Library

#### 3. E2E
- Playwright
- 核心路径：注册→建工作区→建任务→分配→评论
- 边界：跨租户、重复提交、请求取消、token 过期、5xx

#### 4. 覆盖率
- `@vitest/coverage-v8`
- 输出 text + lcov + json-summary
- 授权、Owner 不变量、刷新轮换单独设高门槛（≥90%）

#### 5. 跨角色授权矩阵
- owner/admin/member × 所有端点 × 跨租户/同租户
- 生成权限矩阵表 + 全路径测试

#### 6. 性能基线
- k6 或自写压测
- 普通/峰值两档负载
- P50/P95/P99、QPS、错误率
- DB 连接池指标
- 稳定分页测试

#### 7. 安全加固
- 生产启动强制 JWT secret（无默认值）
- 登录限流（令牌桶）
- 安全 Header（helmet）
- refresh 轮换改为原子 `UPDATE ... WHERE revoked_at IS NULL RETURNING`
- 并发重放测试

#### 8. 可观测性
- 结构化日志（Fastify logger 开启）
- 请求 ID（X-Request-Id）
- 健康/就绪检查（/health、/ready）
- HTTP/DB 指标（/metrics）
- 错误关联（请求 ID 串联）

#### 9. 故障演练
- DB 不可用/恢复
- 迁移失败
- 备份恢复
- 进程重启
- 验证没有半写入

#### 10. OpenAPI 契约
- 用 Ajv 校验请求/响应 schema
- 错误响应、状态码与 OpenAPI 一致

### 验收清单
- [ ] 服务层拆分完成，每层独立测试
- [ ] 前端完整实现，所有页面可用
- [ ] E2E 覆盖核心路径 + 边界
- [ ] 覆盖率 ≥80%，关键模块 ≥90%
- [ ] 跨角色授权矩阵完整
- [ ] 性能基线报告生成
- [ ] 安全加固完成，并发重放测试通过
- [ ] 可观测性完整（日志/指标/健康检查）
- [ ] 故障演练通过（DB 挂掉/恢复/迁移失败/备份恢复）
- [ ] OpenAPI 契约校验通过
- [ ] docker-compose up 一键启动（含前端）
- [ ] CI 全绿（lint + test + coverage + build + E2E）

---

## P03 电商交易 Demo · 完整版

### 当前缺口
- 状态机只有 created/paid/cancelled 三态，缺 shipped/completed/refunding/refunded 四态
- 双锁对照只有行锁，缺乐观锁
- OWASP A01–A10 未全覆盖
- 压测是 20 并发抢 150 件，不是 100 并发抢 10 件
- 故障注入缺 DB/Redis 挂掉
- 运行时 MQ 未接通（server.js 不启动 Outbox 发布器/消费者）
- 无前端、无 E2E、无覆盖率
- Mock gateway 不可配置延迟/失败率

### 必做清单

#### 1. 七态状态机
- 扩展为：pending_payment / paid / shipped / completed / cancelled / refunding / refunded
- 新建迁移：created → pending_payment 回填
- 抽出独立状态机模块 `src/stateMachine.js`
- 建立 7×7 合法/非法迁移矩阵
- 测试全流程：下单→支付→发货→完成，以及支付后退款、发货后退款、完成后退款、重复回调、并发竞争
- 明确退款是否回补库存，禁止重复回补

#### 2. 双锁对照
- 行锁：`SELECT ... FOR UPDATE`
- 乐观锁：`version` 字段 + 条件更新
- 配置选择：`LOCK_STRATEGY=row|optimistic`
- 同一正确性套件跑两遍
- 同口径性能对照

#### 3. 完整商品/库存/订单/支付模型
- Product 独立表（商品属性）
- Inventory 独立表（库存）
- Order 独立表（订单）
- Payment 独立表（支付单：金额、状态、尝试次数、回调、退款关联）
- PaymentAttempt 独立表（支付尝试）
- 外键约束完整

#### 4. Mock gateway
- 独立服务 `mock-gateway/`
- 可配置：延迟、失败率、重复回调、乱序回调
- 可种子化随机（确定性测试）
- 测试必须确定性

#### 5. 运行时 MQ 集成
- 独立 worker 服务 `src/worker.js`
- 启动 Outbox 发布器 + MQ 消费者
- 健康检查、重试、优雅关闭
- docker-compose 增加 worker 服务
- 验证支付后实际生成通知

#### 6. OWASP A01–A10 全覆盖（2025 口径）
- A01 访问控制失效：可信认证身份、列表/详情/取消/退款/发货/导出/错误信息全覆盖、SSRF 边界
- A02 安全配置错误：启动强制秘密、最小权限、完整安全 Header、CORS、调试关闭、默认账户检查
- A03 软件供应链失效：依赖审计、OSV/Dependency Review、SBOM、签名/provenance、基础镜像固定
- A04 加密机制失效：常量时间比较、原始字节验签、时间戳和重放窗口、密钥轮换、敏感字段与日志审查
- A05 注入：SQL/命令/路径注入 PoC、浏览器 XSS（存储/反射/DOM）测试与修复
- A06 不安全设计：STRIDE/滥用案例、金额与权限威胁模型、状态机与业务滥用测试
- A07 认证失效：真实用户认证、会话过期/撤销、限流、账户枚举防护、Cookie 属性、暴力破解测试
- A08 软件或数据完整性失效：事件指纹、同 ID 不同内容 409、严格 schema、原型污染/反序列化测试
- A09 安全日志和告警失效：认证失败、越权、签名失败、重放、状态冲突记录、请求 ID、脱敏、不可篡改保留、告警演练
- A10 异常条件处理不当：无效 ID、DB/MQ/Redis 超时、连接中断、rollback 失败、资源释放、健康降级、恢复
- CSRF、点击劫持、开放重定向、文件上传：单独写明"已测或不适用理由"

#### 7. 压测重做
- 改为 **100 并发抢 10 件**
- 行锁与乐观锁分别运行相同负载
- 断言：最终库存 0、成功订单 10、无负库存、无额外副作用
- 输出：总耗时、QPS、P50/P95/P99、错误率
- 分开报告：全部响应、成功订单、业务缺货响应的延迟
- 保存：每请求原始数据、环境、连接池、CPU/内存/DB 锁等待、多轮结果

#### 8. 故障注入
- DB 挂掉：应用代理断开连接或停止隔离 DB，验证超时、500、连接释放、无订单半提交、恢复后一致
- Redis 挂掉：如果引入 Redis（缓存/限流），测试故障语义；否则正式修订验收，标为不适用，增加 RabbitMQ 不可用演练
- 消息重复：支付回调和 MQ 重投测试、broker 不可用、发布确认前崩溃、消费后 ack 前崩溃、恢复和对账

#### 9. 前端与 E2E
- 商品列表、购物车、下单、支付、订单详情、发货、完成、退款演示路径
- Playwright 测试

#### 10. 覆盖率
- Node V8/c8 覆盖率
- 状态迁移和支付/库存不变量单独做模型覆盖

#### 11. 干净 Compose 演示
- 新库自动种子商品/用户
- 一键业务 smoke

#### 12. 可观测性
- 请求 ID、支付/退款/库存指标、Outbox 积压与 DLQ 告警、依赖健康检查

### 验收清单
- [ ] 七态状态机完整，7×7 迁移矩阵测试通过
- [ ] 双锁对照实现，同套件跑两遍，性能对照报告
- [ ] 完整商品/库存/订单/支付模型
- [ ] Mock gateway 可配置，测试确定性
- [ ] 运行时 MQ 集成，worker 服务启动，支付后实际生成通知
- [ ] OWASP A01–A10 全覆盖（2025 口径），每项有复现+修复+回归
- [ ] 压测 100 并发抢 10 件，双锁对照，原始数据完整
- [ ] 故障注入 DB/Redis/消息重复全通过
- [ ] 前端与 E2E 完整
- [ ] 覆盖率 ≥80%，关键模块 ≥90%
- [ ] 干净 Compose 一键启动 + 业务 smoke
- [ ] 可观测性完整
- [ ] CI 全绿

---

## P04 综合 SaaS · 完整版

### 当前缺口
- 深度模块"实时通知/后台调度"缺 priority/公平调度/三档容量/两类故障
- CI 无 lint/deploy
- RBAC 缺 viewer 角色
- 审计 before/after 不全
- 无 PostgreSQL RLS
- 无前端、无 E2E、无覆盖率
- 竞态：创建客户等"角色检查后写入"的窄竞态

### 必做清单

#### 1. 深度模块：实时通知/后台调度完整版
- **通知通道**：实现至少一种明确通知通道（SSE/WebSocket/邮件/Webhook）
- **Outbox**：跟进/提醒与 Outbox 同事务，独立 relay 发布，消费端 Inbox 去重
- **业务接入**：创建跟进时生成提醒，部署独立 worker，优雅关闭、恢复、就绪检查
- **priority**：增加优先级字段、索引、可控老化，测试高优先级与防饿死
- **公平调度**：租户配额/轮询/加权公平队列，验证多租户积压下服务份额和最大等待
- **重试死信**：指数退避+jitter、错误分类、DLQ、人工重放、幂等和审计
- **容量估算**：依据提醒量、峰值系数、单任务耗时、worker 并发、DB 连接和保留期计算普通/峰值/超容量三档
- **压测**：普通/峰值/过载同口径报告，吞吐、P50/P95/P99、积压恢复时间、公平性、错误率、资源饱和度
- **故障**：worker 真崩溃、DB 不可用、Redis 或通知通道故障，验证恢复、无重复副作用
- **Runbook**：积压、DLQ、worker 卡死、锁过期、通知通道故障、恢复与对账流程

#### 2. CI/CD 完整
- lint（ESLint）
- 类型/语法检查
- 测试
- 覆盖率
- build
- 安全扫描
- 制品
- 受控 deploy

#### 3. RBAC 四角色
- owner/admin/member/viewer
- viewer 只读
- 生成全端点×角色×租户矩阵

#### 4. 审计完整
- 所有写操作统一审计
- before/after JSON
- 请求 ID、actor、时间
- 限制审计更新/删除
- 独立证据：`audit_log.txt`、`rbac.txt`、`multi_tenant.txt`

#### 5. PostgreSQL RLS
- 行级隔离作为纵深防御
- jobs 等所有表补租户约束
- 跨租户测试

#### 6. 竞态修复
- 成员校验放进同一事务或 `WHERE EXISTS`
- 测试写入期间移除成员

#### 7. 前端与 E2E
- 至少一条 UI→API→DB 主路径
- Playwright 测试

#### 8. 覆盖率
- coverage 报告
- 权限、审计、状态与调度关键路径单列门槛

### 验收清单
- [ ] 深度模块完整（通知通道/Outbox/业务接入/priority/公平调度/重试死信/容量估算/压测/故障/Runbook）
- [ ] CI/CD 完整（lint/test/coverage/build/安全扫描/制品/deploy）
- [ ] RBAC 四角色矩阵完整
- [ ] 审计完整（before/after/请求 ID/独立证据）
- [ ] PostgreSQL RLS 启用，跨租户测试通过
- [ ] 竞态修复，写入期间移除成员测试通过
- [ ] 前端与 E2E 完整
- [ ] 覆盖率 ≥80%，关键模块 ≥90%
- [ ] CI 全绿

---

## MS6 总验收

- [ ] P02/P03/P04 全部达到完整版验收清单
- [ ] 所有 evidence 真实生成，manifest 全部通过
- [ ] 所有项目 docker-compose up 一键启动
- [ ] 所有 CI 全绿
- [ ] 更新 `07-项目实现/README.md`，标注"完整版"
- [ ] 更新 `04-资源与评估/项目审计与优化报告.md`，标注 MS6 闭合
