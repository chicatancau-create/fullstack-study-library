# MS9 · 自建题库真实环境升级

> 目标：把 SQL50/RAG65/后端30/英文面试10套从"纯函数/内存态"升级为**真实环境**，达到 `09-整合任务/MS4-自建题库.md` 原始验收标准。
> 定位：**自学自测**，学习者可以在真实环境中练习。
> 前置：MS6、MS7、MS8 完成。

## 全局规则

1. 每个专题题库必须保留纯函数/内存态作为快速单元层，同时增加真实环境层。
2. 所有真实环境必须可一键启动（docker-compose 或等效）。
3. 所有 evidence 必须真实生成，禁止手改。
4. 提交格式：`feat(sql): MS9-真实环境-<子项>`。

---

## SQL50 · 真实环境升级

### 当前缺口
- 双会话写偏差/死锁题：当前是单会话元数据查询
- EXPLAIN 判定题：不检查执行计划
- 迁移回滚题：只是统计 schema 表数量
- PostgreSQL/MySQL 方言对照题：当前都是 PG

### 必做清单

#### 1. 双会话写偏差与死锁
- 升级判定器：双独立 `pg.Client` + barrier 的场景编排
- 学生只提交事务 SQL，会话时序、最终不变量和错误码由教师控制
- 写偏差验证：RC/RR/Serializable、父行锁、Serializable 重试
- 死锁验证：`40P01`、pg_locks、统一锁顺序、lock_timeout、恢复
- 增加"错误答案必须失败"的并发变异用例

#### 2. EXPLAIN 判定
- 在只读事务中对候选查询执行 `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)`
- 遍历计划树，断言目标表使用预期索引及 Index Scan/Index Only Scan
- 检查是否仍有目标 Seq Scan、连接策略和实际行数
- 使用足够数据和 ANALYZE，禁止只靠 `enable_seqscan=off` 制造通过
- 无索引/错误索引变体必须失败

#### 3. 在线迁移与回滚
- 引入旧/新应用客户端和持续读写
- 改类型走新列、分批回填、双写、校验、切读
- 删字段在旧应用退出后执行
- 测旧新应用×旧新 schema 矩阵
- 注入回填失败和版本回滚，验证前向修复或独立库恢复
- 比较行数、约束、数据校验和及业务结果

#### 4. PostgreSQL/MySQL 方言
- 新增 `数据/mysql/schema.sql`、`seed.sql` 和 MySQL 参考答案
- CI 同时启动 PostgreSQL 与 MySQL 8.4
- 对字符串拼接、NULL 排序、类型转换、JSON、日期截断、UPSERT 等逐题输出双方结果和差异解释
- 统一结果比较的类型/时区/排序规范化

### 验收
- [ ] 双会话写偏差/死锁题完整
- [ ] EXPLAIN 判定题完整
- [ ] 在线迁移与回滚题完整
- [ ] PostgreSQL/MySQL 方言对照题完整
- [ ] 所有 evidence 真实生成

---

## RAG golden set · 真实环境升级

### 当前缺口
- 当前是 BM25 + 抽取式回答，不是真实 LLM
- 无真实 embedding 模型
- 无真实企业语料

### 必做清单

#### 1. 真实 LLM 接入
- 抽象 `LLMClient`，保留离线实现作为可重复基线
- 支持至少一个真实提供方（OpenAI/Claude/通义）
- `RAG_PROVIDER`、base URL、model、API version
- 密钥只从环境/CI secret 读取
- 超时、有限重试、429/5xx、预算上限、结构化错误
- 响应包含 answer、citations、prompt/completion tokens
- 保存真实模型、系统提示版本、上下文版本、调用延迟、token、费率版本
- 生成器和评估器分离
- 离线 CI 每次运行，真实 API 用 `workflow_dispatch`/定期任务运行

#### 2. 真实 embedding 接入
- 可选 OpenAI/通义 embedding，或多语言 BGE-M3/E5、Voyage 等
- 使用 pgvector 或等价向量库
- 记录模型、维度、归一化、分块、索引版本
- 模型变化必须重建独立向量版本
- BM25+向量混合检索、RRF、cross-encoder 重排
- 保留租户前置过滤
- 对照纯 BM25 的 recall、precision、P95、成本

#### 3. 真实语料
- 引入有授权的企业运维文档、公开技术文档或自有真实项目 Runbook
- 保存许可证、来源、快照哈希、租户、版本、有效期、数据分类、脱敏记录
- 人工双人标注和仲裁
- 可接受答案变体、冲突文档、过期文档、不可回答问题
- 防止 golden 与语料模板同源造成虚高
- 增加时间外/未见文档测试集
- 增加 claim 级引用、Context Precision/Recall、Faithfulness、人工抽检

### 验收
- [ ] 真实 LLM 接入完整
- [ ] 真实 embedding 接入完整
- [ ] 真实语料引入完整
- [ ] 混合检索对照完整
- [ ] 所有 evidence 真实生成

---

## 后端实操 30 · 真实环境升级

### 当前缺口
- 所有题都是纯函数/内存态，没有真实 DB/JVM

### 必做清单

| 题组 | 升级方式 |
|---|---|
| A01–A08 | 真实 Fastify HTTP + OpenAPI validator，验证版本兼容、Accept、废弃字段、端到端契约 |
| B01–B08 | PostgreSQL 多租户种子 + API/RLS，覆盖对象、字段、导出、日志、拒绝审计 |
| C01–C06 | 真实 PG 乐观锁、悲观锁、唯一索引、双会话并发、冲突重试、按 key 串行 |
| D01–D04 | PostgreSQL Outbox + RabbitMQ，覆盖崩溃、重投、死信、重放、对账 |
| E01–E04 | 真实 Spring Boot/JVM：GC 日志和 JFR、堆快照/OOME、Java 死锁+jstack、线程/CPU 诊断 |

优先级：C/D/E 必须最先升级为真实环境，B/A 随后。

### 验收
- [ ] A01–A08 真实 Fastify HTTP 完整
- [ ] B01–B08 真实 PostgreSQL 完整
- [ ] C01–C06 真实 PG 并发完整
- [ ] D01–D04 真实 Outbox + RabbitMQ 完整
- [ ] E01–E04 真实 Spring Boot/JVM 完整
- [ ] 所有 evidence 真实生成

---

## 全英文面试 10 套 · 可执行模拟面试

### 当前缺口
- 当前是文字题包，不是可执行的模拟面试

### 必做清单

1. **本地 Web 应用**：按 5/25/20/10 分钟自动分段计时
2. **随机抽套题和追问**：记录时间、题面版本、评估者
3. **录音**：经明确同意后使用 `getUserMedia/MediaRecorder` 本地录音，默认不上传
4. **算法编辑器**：测试运行、API 设计提交、最终代码快照
5. **评分录入**：四维 rubric 锚点、时间戳原话、红线、反馈
6. **转写**：可接入本地 Whisper 或经同意的转写服务
7. **双评估者**：独立评分、分歧仲裁、反馈导出、删除
8. **隐私**：录音、转写和个人信息不得入 Git，设置保留期、访问控制、删除证据
9. **E2E**：用虚拟媒体流做 Playwright E2E，验证计时、录制、评分、导出、删除流程

### 验收
- [ ] 本地 Web 应用完整
- [ ] 随机抽套题和追问完整
- [ ] 录音功能完整
- [ ] 算法编辑器完整
- [ ] 评分录入完整
- [ ] 转写功能完整
- [ ] 双评估者完整
- [ ] 隐私保护完整
- [ ] E2E 完整

---

## MS9 总验收

- [ ] SQL50 真实环境升级完整
- [ ] RAG golden set 真实环境升级完整
- [ ] 后端实操 30 真实环境升级完整
- [ ] 全英文面试 10 套可执行模拟面试完整
- [ ] 所有 evidence 真实生成
- [ ] 更新 `08-判定题库/专题题库/README.md`，标注"真实环境版"
- [ ] 更新 `04-资源与评估/项目审计与优化报告.md`，标注 MS9 闭合
