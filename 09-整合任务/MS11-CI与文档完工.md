# MS11 · CI 全覆盖 + 工具现代化 + 文档一致性

> 目标：把 CI 从"4 个 workflow"扩展为**全覆盖**，把工具从"面向旧双仓库"现代化，把文档从"多处矛盾"统一为**一致口径**。
> 前置：MS6、MS7、MS8、MS9、MS10 完成。

## 全局规则

1. 每个 workflow 必须有明确的 trigger、job、步骤、退出码。
2. 所有文档必须与当前资产状态一致，禁止过期描述。
3. 提交格式：`feat(ci): MS11-<子项>`。

---

## 一、CI 全覆盖

### 当前缺口
- 只有 4 个根 workflow（experiments、ms1-p02、ms1-p03、ms1-p04）
- E03–E13 多数只验证 manifest，没有实际运行实验
- G0–G9、SQL50、RAG、后端 30、英文面试、MS5 均无 CI
- 无覆盖率、无 lint、无部署、无完整故障/压测门禁
- P02 项目内还有嵌套 ci.yml，GitHub 不会识别
- P03 有确定的测试密钥不一致

### 必做清单

#### 1. 新增 workflow 清单

| 文件 | Trigger | Jobs 与主要步骤 |
|---|---|---|
| `experiments.yml` | push、PR；长任务另拆 nightly | Node 24 矩阵跑 E03/E05/E06；PG 跑 E07/E08；Redis 跑 E09；PG+RabbitMQ 跑 E10；浏览器/ZAP 跑 E11；E04 安装 tcpdump/TLS/HTTP2 工具；上传原始证据 |
| `experiments-nightly.yml` | schedule、workflow_dispatch | E12 开放/闭环三档压测、火焰图；E13 Compose/kind 蓝绿/金丝雀/回滚；多轮故障和长时间稳定性 |
| `student-packages.yml` | `08-判定题库/**`、workflow 自身变更 | 学生包 schema、公开测试、答案/隐藏路径扫描、打包后解包复测 |
| `ms4-sql.yml` | SQL50 路径、workflow 自身 | PostgreSQL 18 + MySQL 8.4；结果集 judge、自伤测试、双会话、死锁、EXPLAIN、在线迁移、恢复、方言矩阵 |
| `ms4-rag.yml` | RAG 路径、workflow 自身 | 安装锁定 Python 依赖；65 条离线评测、schema、租户反向自检、注入、语料许可证/隐私检查、coverage |
| `ms4-rag-live.yml` | workflow_dispatch、每周 schedule | 仅在受保护环境使用模型 secret；真实 LLM/embedding、token/成本/P95、失败重试、预算上限 |
| `ms4-backend.yml` | 后端 30 路径、workflow 自身 | Node 24 + PG/RabbitMQ；Java/Maven + MySQL/Testcontainers；30 题 solution/starter 双向判定和真实环境组 |
| `ms5-sources.yml` | 国内大厂真题路径、workflow 自身 | JSON Schema、数量、canonical ID、去重账本、输入快照哈希、M/E 映射、模板答案检测、岗位分布 |
| `ms5-links.yml` | schedule、workflow_dispatch | 低速率检查原始面经和 LeetCode/CodeTop；识别软 404/登录页；生成差异报告 |
| `release-deploy.yml` | main 受保护推送、tag、人工环境批准 | P02/P03/P04 lint/test/coverage/build、镜像、SBOM/provenance、部署到隔离环境、业务 smoke、回滚验证 |
| `verify-all.yml` | 全仓 push、PR | source-only、秘密扫描、`git diff --check`、新版 `verify_all.mjs --profile ci`、资产结构、文档状态、覆盖率汇总 |

#### 2. 修复现有问题
- 删除 P02 项目内嵌套 ci.yml（与根 workflow 重复）
- 修复 P03 测试密钥不一致（`ci-api-key/ci-provider-secret` vs `test-key/test-provider-secret`）
- 所有 workflow 必须有明确的退出码（失败返回非零）

#### 3. 覆盖率报告
- P02/E03/E05：`@vitest/coverage-v8`，输出 text、lcov、json-summary
- P03/P04 和其他 node:test：Node 24 V8/c8，限定 `src/**`
- Java：JaCoCo
- Python/RAG：`coverage.py`
- 上传 lcov、HTML 和摘要 artifact
- PR 展示行/分支变化
- 覆盖率采用基线 ratchet，防止下降
- 状态机除代码覆盖率外，必须单独验证全部合法/非法迁移
- 授权、租户隔离、支付/库存、刷新 token 等关键模块应设高于普通代码的门槛

### 验收
- [ ] 所有 workflow 文件创建完整
- [ ] 现有问题修复完整
- [ ] 覆盖率报告完整
- [ ] 所有 CI 全绿

---

## 二、工具现代化

### 当前缺口
- `scripts/verify_all.mjs` 默认检查 `E:/fullstack-code` 外部练习仓库
- P02/P03/P04 标签指向外部旧仓库，不是当前 `07-项目实现/`
- 只检查 manifest，没有运行 07/08/09 的实际资产
- 默认访问 Pages 网络
- 依赖当前工作目录

### 必做清单

#### 1. verify_all.mjs 现代化
- 从 `import.meta.url` 推导仓库根，不依赖 `process.cwd()`
- 默认只检查当前仓库；只有显式传 `--practice-root` 或 `PRACTICE_ROOT` 才检查外部练习仓库
- 显式给了路径但不存在必须失败；未给路径则标为"未启用"
- 增加 `--profile quick|full|ci`、`--offline`、`--teacher-root`
- 自动发现：
  - `06-实验代码/E*/evidence/manifest.json`
  - `07-项目实现/P*/evidence/manifest.json`
  - `08-判定题库/` 学生包结构和专题资产
  - `09-整合任务/` 验收映射与文档状态
- 纳入实际检查：
  - 07：migrate/test/coverage/build/Compose smoke
  - 08：G0–G9 学生包、SQL50、RAG、后端 30、面试结构、MS5 schema
  - 09：里程碑条目到证据的链接完整性
- 输出 text + JSON；区分 pass/fail/skipped/not-enabled；任何必需失败非零

#### 2. verify_archive.sh 现代化
- 去掉 Windows 默认路径
- 默认只 archive 当前库
- 外部 practice 改为可选
- 纳入 07/08/09

### 验收
- [ ] verify_all.mjs 现代化完整
- [ ] verify_archive.sh 现代化完整
- [ ] 所有检查通过

---

## 三、文档一致性

### 当前缺口
- 000-学习总览.md："8 个 job、11 份 manifest"等计数过期
- 根 README.md：MS4/MS5"接近完成"过于乐观
- 09-整合任务/竣工报告-2026-11-08.md：artifact 数写为 12/15/8，与实际 P02/P03/P04=8/12/15 不符
- 04-资源与评估/项目审计与优化报告.md：第 110 行仍说 G8/G9、SQL、RAG 未制作；第 252 行错称物理隔离通过
- 09-整合任务/README.md："深度短板（MS1–MS5 闭合）"与事实不符
- 07-项目实现/README.md：声称三项目统一 `npm run evidence`，但 P03/P04 package.json 没有该 script
- 08-判定题库/专题题库/README.md：**文件不存在**，但阶段报告链接到它
- 03-执行计划/进度看板.md：P03/P04 项目仍为空
- 04-资源与评估/最终验收对照-2026-11-08.md：E03–E13、P03 状态机、P04 深度模块多处标"完成"，实际只是核心子项
- 04-资源与评估/交接-下一个AI-2026-11-08.md：仍是旧分支、旧 HEAD、11 份 manifest、旧 CI 状态
- 07-项目实现/P03-电商交易Demo/README.md：延迟数字与当前 `evidence/load.txt` 不一致
- 07-项目实现/P04-综合SaaS/docs/architecture.md：仍称无缓存/队列
- 07-项目实现/P04-综合SaaS/docs/tracking.md：仍称限流、Docker、CI/K8s、HTTPS、监控未覆盖
- 07-项目实现/P04-综合SaaS/docs/review.md：仍写"登录无速率限制"
- 04-资源与评估/施工验证报告.md：称 TODO 扫描 0 处，但当前 G0–G9 有 10 个 TODO
- 04-资源与评估/岗位能力矩阵与验收标准.md：M01、M02、M12 没有明确判定题库映射
- 05-外部资料库/资料补缺清单.md：多个"待制作/进行中"未闭合

### 必做清单

#### 1. 计数与状态更新
- 000-学习总览.md：按最终 CI 和资产重新生成
- 根 README.md：状态改为严格口径
- 09-整合任务/竣工报告-2026-11-08.md：保留历史报告；最终另建 `完工报告-<日期>.md`
- 04-资源与评估/项目审计与优化报告.md：将历史基线和当前增量分区；错误结论立即纠正
- 09-整合任务/README.md：改为"目标范围"，链接到真实状态矩阵

#### 2. 链接与脚本修复
- 07-项目实现/README.md：增加 evidence alias 或改为实际 `bash scripts/run_project.sh`
- 08-判定题库/专题题库/README.md：新建专题索引或改链接
- 03-执行计划/进度看板.md：区分"仓库资产状态"和"个人学习验收状态"
- 04-资源与评估/最终验收对照-2026-11-08.md：每项拆为"核心子项完成/原范围完成"
- 04-资源与评估/交接-下一个AI-2026-11-08.md：更新为当前 HEAD 和工具边界，或明确标为历史交接快照

#### 3. 项目文档更新
- 07-项目实现/P03-电商交易Demo/README.md：从结构化压测结果自动生成摘要
- 07-项目实现/P04-综合SaaS/docs/architecture.md：补 Redis、jobs/worker 实际架构
- 07-项目实现/P04-综合SaaS/docs/tracking.md：重新生成追踪表，补 viewer、审计 before/after、容量故障缺口
- 07-项目实现/P04-综合SaaS/docs/review.md：修正限流状态和测试数

#### 4. 评估文档更新
- 04-资源与评估/施工验证报告.md：改为"10 个 intentional student starter TODO"
- 04-资源与评估/岗位能力矩阵与验收标准.md：按 M01–M15 逐项映射真实题包、实验、项目和运行入口

#### 5. 补缺清单更新
- 05-外部资料库/资料补缺清单.md：
  - `E01-E13-ASSETS` 拆成 CORE 与 FULL 两项
  - `SQL-OFFLINE` 保留基础题库闭合，新增 `SQL-DEPTH`
  - `RAG-EVAL-SET` 保留离线 golden 闭合，新增 `RAG-LIVE` 和 `RAG-REAL-CORPUS`
  - `COMPANY-TAGS` 纳入原始输入恢复、去重账本、逐题面经和岗位覆盖

### 验收
- [ ] 所有计数与状态更新完整
- [ ] 所有链接与脚本修复完整
- [ ] 所有项目文档更新完整
- [ ] 所有评估文档更新完整
- [ ] 补缺清单更新完整
- [ ] 无失效链接
- [ ] 无矛盾描述

---

## 四、MS11 总验收

- [ ] CI 全覆盖完整
- [ ] 工具现代化完整
- [ ] 文档一致性完整
- [ ] 所有 CI 全绿
- [ ] 所有文档与当前资产状态一致
- [ ] 更新 `04-资源与评估/项目审计与优化报告.md`，标注 MS11 闭合
