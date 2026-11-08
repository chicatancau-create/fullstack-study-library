# MS2 · E03–E13 实验补齐

> 目标：把 `01-阶段课程/专项-核心原理与深度实验.md` 中设计的 11 个实验，全部做成可运行代码包。
> 工作量：周级。优先级：P0。
> 前置：MS0、MS1 完成。

## 全局规则

1. 在 `06-实验代码/` 下，按现有 E01/E02 结构补齐 E03–E13。
2. 每个实验目录结构统一：
   ```
   06-实验代码/EXX-名称/
   ├── README.md          # 目标、原理、启动方式、判读标准
   ├── src/               # 源码
   ├── tests/             # 单元 + 集成
   ├── scenarios/         # 反例/故障注入脚本
   ├── scripts/           # 构建/运行/证据生成
   └── evidence/          # 构建/测试/反例输出
   ```
3. **必须遵循的原则**：
   - 失败不会被静默忽略（scripts 末尾返回非零）
   - 每个反例都要有"预期失败"标记，与"非预期失败"区分
   - README 明确"实验边界"：本实验**不**证明什么
4. 提交格式：`feat(E03): MS2-React 竞态与缓存`。

---

## E03 React 竞态与缓存

- 目标：证明 Effect 竞态、缓存失配、SSR/CSR 不一致
- 反例：快速切换路由导致旧响应覆盖新响应
- 证据：竞态复现 + 修复（AbortController）

## E04 HTTP/网络

- 目标：TCP 握手、HTTP/1.1 vs HTTP/2、缓存协商、CORS
- 工具：curl、wireshark/tcpdump、Node http server
- 证据：抓包截图、缓存命中/未命中对照

## E05 React 渲染与构建

- 目标： reconciliation、bailout、memo 边界、Vite 构建优化
- 反例：不必要的重渲染、错误的依赖数组
- 证据：React DevTools Profiler 输出、bundle 分析

## E06 Node 运行时诊断

- 目标：事件循环阻塞、内存泄漏、CPU profile
- 工具：clinic.js、--inspect、0x
- 反例：同步忙循环、闭包泄漏
- 证据：火焰图、heap snapshot 对照

## E07 SQL 事务与执行计划

- 目标：ACID、隔离级别、写偏差、锁、执行计划
- 反例：读已提交 vs 可重复读下的写偏差、死锁
- 工具：PostgreSQL、EXPLAIN ANALYZE、pg_locks
- 证据：写偏差复现 + 修复（SELECT FOR UPDATE）、死锁日志

## E08 数据库迁移与回滚

- 目标：在线迁移、双向兼容、回滚
- 场景：加字段、改字段类型、删字段
- 工具：Prisma migrate、自写迁移脚本
- 证据：迁移成功、回滚成功、旧代码兼容

## E09 分布式锁与幂等

- 目标：Redis 分布式锁、 fencing token、幂等设计
- 反例：锁过期但任务未结束、重复提交
- 工具：Redis、Redlock
- 证据：锁竞争测试、 fencing token 防止 stale 写

## E10 消息崩溃窗口

- 目标：Outbox 模式、死信队列、对账
- 场景：DB 写成功但消息未发、消息发了但 DB 回滚
- 工具：PostgreSQL + Redis Stream（或 RabbitMQ）
- 证据：Outbox 表、死信处理、对账脚本

## E11 OWASP 实战

- 目标：A01–A10 全路径
- 工具：OWASP ZAP、Burp Community、手写 PoC
- 证据：每个 A 类至少 1 个复现 + 修复

## E12 容量与压测

- 目标：容量估算、负载模型、coordinated omission
- 工具：k6、 vegeta、自写压测
- 反例：开放负载 vs 封闭负载的差异
- 证据：三档负载报告、原始数据、火焰图

## E13 发布与恢复

- 目标：蓝绿/金丝雀、回滚、SLO 计算
- 工具：docker-compose、kind、自写脚本
- 反例：发布失败、数据库不兼容
- 证据：发布日志、回滚演练、SLO 计算表

---

## 里程碑验收

- [ ] E03–E13 全部有代码包（README + src + tests + scenarios + scripts + evidence）
- [ ] 每个实验 `npm run evidence` 或 `make evidence` 都能跑通
- [ ] 每个实验 README 明确"实验边界"
- [ ] 更新 `06-实验代码/README.md`，把 E03–E13 标为"已落地"
- [ ] 更新 `04-资源与评估/项目审计与优化报告.md`、`05-外部资料库/资料补缺清单.md`
