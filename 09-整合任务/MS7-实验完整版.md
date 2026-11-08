# MS7 · 实验完整版（E03–E13 全范围）

> 目标：把 E03–E13 从"核心子集"补齐为**完整版**，达到 `01-阶段课程/专项-核心原理与深度实验.md` 原始验收标准。
> 定位：**自学实验**，学习者可以对照完整实现理解原理。
> 前置：MS6 完成。

## 全局规则

1. 每个实验必须有：README + src/ + tests/ + scenarios/ + scripts/ + evidence/。
2. 所有 evidence 必须真实生成，禁止手改。
3. 每个实验 README 必须有"实验边界"声明（本实验**不**证明什么）。
4. 提交格式：`feat(E03): MS7-完整版-<子项>`。

---

## 结构补齐总表

| 实验 | 缺 src/ | 缺 tests/ | 缺 scenarios/ |
|---|---|---|---|
| E03 | — | — | ✅ 补 |
| E04 | — | ✅ 补 | ✅ 补 |
| E05 | — | — | ✅ 补 |
| E06 | ✅ 补 | ✅ 补 | — |
| E07 | — | — | ✅ 补 |
| E08 | — | ✅ 补 | ✅ 补 |
| E09 | — | — | ✅ 补 |
| E10 | — | ✅ 补 | ✅ 补 |
| E11 | — | — | ✅ 补 |
| E12 | — | ✅ 补 | ✅ 补 |
| E13 | — | ✅ 补 | ✅ 补 |

---

## E03 React 竞态与缓存 · 完整版

### 当前缺口
- 缺 SSR/CSR 不一致、hydration、真实路由切换
- 缺真正的缓存键失配、失效、陈旧缓存、跨标签页/查询缓存
- 缺真实浏览器、网络、路由与性能测量
- 缺 scenarios/

### 必做清单
1. **Playwright 路由快速切换**：真实延迟、竞态复现
2. **SSR/hydration 反例**：时间、随机 ID、Date、locale、服务端/客户端数据差异
3. **缓存对照**：缓存 key/invalidation/stale-while-revalidate
4. **网络时序**：保存网络时序、渲染结果、hydration 错误和修复证据
5. **scenarios/**：竞态反例、缓存失配反例、hydration 反例

### 验收
- [ ] SSR/CSR 不一致复现 + 修复
- [ ] 缓存键失配复现 + 修复
- [ ] Playwright 路由切换测试通过
- [ ] scenarios/ 完整

---

## E04 HTTP/网络 · 完整版

### 当前缺口
- 缺 TCP 三次握手、TLS、HTTP/2、抓包
- 缺 DNS 失败和 ECONNREFUSED 完整复现
- 缺 tests/、scenarios/

### 必做清单
1. **TCP 抓包**：tcpdump/Wireshark 保存 SYN/SYN-ACK/ACK、重传、连接复用
2. **TLS 抓包**：ClientHello/ServerHello、证书、ALPN
3. **HTTP/1.1 vs HTTP/2**：多流对照、SETTINGS、stream、时延
4. **DNS 失败**：ECONNREFUSED 完整复现
5. **交付**：.pcap 文件、文本判读、必要截图
6. **tests/**：浏览器和 curl 断言整理进 tests/

### 验收
- [ ] TCP 三次握手抓包完整
- [ ] TLS 抓包完整
- [ ] HTTP/1.1 vs HTTP/2 对照完整
- [ ] DNS 失败复现完整
- [ ] tests/、scenarios/ 完整

---

## E05 React 渲染与构建 · 完整版

### 当前缺口
- 原主题 reconciliation、bailout、memo 边界均未实现
- 缺错误依赖数组、Profiler、bundle 优化、hydration
- 缺 scenarios/

### 必做清单
1. **reconciliation 反例**：父组件更新、同 props bailout、key 重置、状态保留/迁移
2. **memo 边界**：memo 失效、context 穿透
3. **React Profiler**：记录提交次数、渲染时长、组件原因
4. **bundle 优化**：tree-shaking、动态导入、chunk 拆分、压缩、sourcemap、bundle analyzer 对照
5. **包体预算**：构建前后同口径报告
6. **scenarios/**：reconciliation 反例、memo 反例、bundle 优化对照

### 验收
- [ ] reconciliation 反例复现 + 修复
- [ ] memo 边界反例复现 + 修复
- [ ] React Profiler 报告完整
- [ ] bundle 优化对照完整
- [ ] scenarios/ 完整

---

## E06 Node 运行时诊断 · 完整版

### 当前缺口
- 缺 src/、tests/
- 缺真正的火焰图、heap snapshot 对照、长期闭包泄漏和诊断闭环

### 必做清单
1. **src/**：将可复用诊断逻辑移入 src/
2. **tests/**：测试移入 tests/
3. **火焰图**：clinic.js/0x 生成火焰图并定位热点函数
4. **heap snapshot 对照**：闭包泄漏修复前后 heap snapshot、retainer path、多轮堆趋势
5. **忙循环修复**：setImmediate 分片/worker_threads 修复对照
6. **证据**：profile 原文件、摘要、判读、修复回归

### 验收
- [ ] src/、tests/ 完整
- [ ] 火焰图生成并定位热点
- [ ] heap snapshot 对照完整
- [ ] 忙循环修复对照完整

---

## E07 SQL 事务与执行计划 · 完整版

### 当前缺口
- 缺 REPEATABLE READ 对照、Serializable、死锁、pg_locks、连接池
- 执行计划不在本实验内
- 缺 scenarios/

### 必做清单
1. **Serializable**：40001 错误 + 有界重试
2. **死锁**：两连接反向锁顺序制造 40P01，保存 pg_locks/日志，统一顺序修复
3. **lock_timeout**：等待队列和死锁重试
4. **连接池**：耗尽、获取超时、长事务、释放验证
5. **执行计划**：EXPLAIN ANALYZE 证据接入本实验
6. **scenarios/**：Serializable 反例、死锁反例、连接池反例

### 验收
- [ ] Serializable 复现 + 重试通过
- [ ] 死锁复现 + 修复通过
- [ ] 连接池测试通过
- [ ] 执行计划证据完整
- [ ] scenarios/ 完整

---

## E08 数据库迁移与回滚 · 完整版

### 当前缺口
- 缺改类型、删字段、在线双写/双读、旧新应用并行矩阵、真正应用回滚
- 缺 tests/、scenarios/

### 必做清单
1. **expand/contract**：新列→分批回填→双写→校验→切读→旧版本退场→删旧列
2. **兼容矩阵**：old app/new app 对 schema N-1/N/N+1 的读写兼容矩阵
3. **改类型**：持续读写，记录锁等待和失败
4. **代码回滚**：前向修复、备份恢复，区分"数据库 down 迁移"与"恢复"
5. **Prisma migrate**：与自写 SQL 的对应演练
6. **tests/、scenarios/**：完整

### 验收
- [ ] expand/contract 全流程通过
- [ ] 兼容矩阵测试通过
- [ ] 改类型测试通过
- [ ] 代码回滚通过
- [ ] tests/、scenarios/ 完整

---

## E09 分布式锁与幂等 · 完整版

### 当前缺口
- 当前是 Cache Aside，**不是分布式锁实验**
- 必须补 Redlock + fencing token
- 缺 scenarios/

### 必做清单
1. **Redlock**：升级至受支持的 Redis 7，搭独立多实例，实现带 owner token 的锁获取/释放、Redlock quorum、TTL、续租
2. **锁过期反例**：进程暂停制造"锁过期但任务未结束"
3. **fencing token**：DB 保存单调递增 fencing token，拒绝 stale writer
4. **测试**：锁竞争、误删他人锁、quorum 丢失、stale 写、重复请求、同 key 不同 body 冲突
5. **Cache Aside 保留**：作为附加实验，不替代分布式锁
6. **scenarios/**：锁过期反例、stale 写反例、quorum 丢失反例

### 验收
- [ ] Redlock 实现完整
- [ ] fencing token 实现完整
- [ ] 锁过期反例复现 + 修复
- [ ] stale 写反例复现 + 修复
- [ ] scenarios/ 完整

---

## E10 消息崩溃窗口 · 完整版

### 当前缺口
- 缺 tests/
- 缺真正多机/quorum 故障、顺序语义、真实外部副作用
- 缺"消息发了但 DB 回滚"的反例
- 缺完整的"DB 提交但消息未发"恢复矩阵

### 必做清单
1. **朴素反例**：证明先 publish 后 DB rollback 会产生幻影消息，再证明 Outbox 防止该问题
2. **DB 提交后发布前崩溃**：relay 恢复 pending
3. **真实外部副作用**：可控 HTTP 替身或支付副作用验证不可事务副作用的幂等
4. **顺序语义**：同 key 顺序、跨 key 并行、重投乱序及业务处理策略
5. **README 修正**：消除"有 3 容器集群"与边界"没有集群"的矛盾
6. **tests/**：完整

### 验收
- [ ] 朴素反例复现 + Outbox 防护证明
- [ ] DB 提交后发布前崩溃恢复通过
- [ ] 真实外部副作用幂等验证通过
- [ ] 顺序语义测试通过
- [ ] README 矛盾消除
- [ ] tests/ 完整

---

## E11 OWASP 实战 · 完整版

### 当前缺口
- 当前是对象级授权矩阵，**不是 A01–A10 全路径**
- 缺真实 DB、SQL 注入、浏览器 XSS、CSRF、SSRF
- 缺 scenarios/

### 必做清单
1. **按 2025 A01–A10 重建实验**
2. **真实 PG + 浏览器靶场**
3. **SQL 注入**：验证参数化
4. **XSS**：验证输出编码/sanitization/CSP（存储/反射/DOM）
5. **CSRF**：Cookie 会话验证 CSRF token、SameSite、Origin
6. **SSRF**：验证 allowlist、IP 段、重定向、DNS 解析、协议限制
7. **ZAP**：baseline/主动扫描与手工 PoC
8. **证据**：攻击、修复、回归
9. **scenarios/**：A01–A10 每类反例

### 验收
- [ ] A01–A10 每类复现 + 修复 + 回归
- [ ] SQL 注入验证通过
- [ ] XSS 验证通过
- [ ] CSRF 验证通过
- [ ] SSRF 验证通过
- [ ] ZAP 扫描通过
- [ ] scenarios/ 完整

---

## E12 容量与压测 · 完整版

### 当前缺口
- 缺 tests/
- 缺开放负载、coordinated omission 校正、三档容量、资源饱和、火焰图

### 必做清单
1. **开放负载**：k6 arrival-rate 或等效开放模型，与闭环同业务负载对照
2. **coordinated omission 校正**：保存计划发出时间、实际发出时间、完成时间，校正排队遗漏
3. **dropped iterations**：报告 dropped iterations、超时和背压，不只统计已收到响应
4. **三档容量**：普通/峰值/超容量，找容量拐点和恢复时间
5. **资源饱和**：采集客户端/服务端 CPU、内存、事件循环、连接池、火焰图
6. **tests/**：完整

### 验收
- [ ] 开放负载对照完整
- [ ] coordinated omission 校正完整
- [ ] dropped iterations 报告完整
- [ ] 三档容量报告完整
- [ ] 资源饱和采集完整
- [ ] tests/ 完整

---

## E13 发布与恢复 · 完整版

### 当前缺口
- 缺 tests/
- 缺蓝绿、金丝雀、兼容发布、代码回滚、真实告警、多窗口燃烧率

### 必做清单
1. **蓝绿/金丝雀**：Compose/kind 建 blue/green 与可加权 canary
2. **故障注入**：启动失败、5xx、延迟、DB 不兼容，自动停止放量
3. **expand/contract 数据库发布**：旧版本回滚
4. **验证**：制品版本、流量比例、SLO、数据一致性、恢复
5. **证据**：发布日志、回滚演练、SLO 计算表、原始指标、Runbook
6. **tests/**：完整

### 验收
- [ ] 蓝绿/金丝雀发布通过
- [ ] 故障注入自动停止放量通过
- [ ] expand/contract 数据库发布通过
- [ ] 旧版本回滚通过
- [ ] 证据完整
- [ ] tests/ 完整

---

## MS7 总验收

- [ ] E03–E13 全部达到完整版验收清单
- [ ] 所有实验结构完整（src/tests/scenarios/scripts/evidence）
- [ ] 所有 evidence 真实生成，manifest 全部通过
- [ ] 所有实验 README 有"实验边界"声明
- [ ] 更新 `06-实验代码/README.md`，标注"完整版"
- [ ] 更新 `04-资源与评估/项目审计与优化报告.md`，标注 MS7 闭合
