# 专题题库（索引）

> 四个专题题库的入口。所有题面、答案、评分标准公开，学习者自己作答、自己对照、自己评分；不需要教师端，也不做盲测。

## 专题列表

| 专题 | 目录 | 内容 | 运行入口 |
| --- | --- | --- | --- |
| SQL 50 | [`SQL50/`](SQL50/README.md) | 50 道 SQL 题面与答案、离线结果集判定、PostgreSQL 18.6 真实环境（双会话、死锁、EXPLAIN、在线迁移、方言对照） | 见 `SQL50/README.md`；真实环境 `cd SQL50/真实环境 && bash run.sh` |
| RAG 65 | [`RAG-GoldenSet/`](RAG-GoldenSet/README.md) | 65 条离线 golden 评测、指标、检索/生成判定，以及 PostgreSQL 存储 + 混合检索的真实环境层 | `cd RAG-GoldenSet/真实环境 && bash run.sh`；离线评测见其 README |
| 后端实操 30 | [`后端实操30/`](后端实操30/README.md) | A 契约 / B 授权 / C 并发 / D Outbox / E JVM 五组，题面、答案与 `judge.mjs` 判定 | `cd 后端实操30 && node judge.mjs`；真实环境见 `真实环境/README.md` |
| 全英文面试 10 套 | [`全英文面试10套/`](全英文面试10套/README.md) | 10 套 60 分钟英文面试题包、四维评分指南、录音/自评模板与 Web 计时应用 | 见 `全英文面试10套/README.md`；Web 应用 `npm install && npm run dev` |

## 使用顺序（建议）

1. 先读对应目录的 `README.md`，确认题目范围、运行命令与已知边界。
2. 自己作答后再打开答案或评分指南，按 rubric 自评；不要先看答案。
3. 需要真实环境时按各目录脚本运行；脚本会现场生成 `evidence/`，不要手改证据文件。
4. 记录错题与不确定点，回到对应知识点，而不是只记答案。

## 边界

- 四套题库的“真实环境”都是本机隔离环境（PostgreSQL/MySQL/RabbitMQ/Redis/Node/Java），不是生产压测或分布式集群。
- RAG 真实环境使用本地确定性哈希向量与 SQL 余弦检索，没有神经 embedding、pgvector/ANN，也没有真实 LLM 生成。
- 后端实操 E 组是普通 Java 诊断程序，不是 Spring Boot 应用。
- SQL 真实环境只覆盖 PostgreSQL 18.6；MySQL 8.4 仅做方言对照。
- 英文面试评分是本地练习口径，不构成语言能力认证或招聘结论。
