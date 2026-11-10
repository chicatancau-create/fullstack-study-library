# 08-判定题库

> 自学自测区：G0–G9 十个关口的学习包。题面、起始代码、参考答案、自测脚本、评分规则、故障变体**全部公开**，学习者自己读题、自己做、自己对照、自己评分。

## 结构与使用

每个关口的基础结构一致，按需扩展子目录：

```
Gx/
├── README.md        本关说明、判据表、边界
├── 题面.md          题面与要求
├── 起始代码/        从这里开始（可能含 app/、db/、c/、site/ 等子目录）
├── 参考答案/        做完后对照
├── 自测脚本/        smoke + grade（一个函数题一个 grader，复杂题每题一个）
├── 故障变体/        第二套练习：注入缺陷，确认 grader 会报错
├── 评分规则.json    机器可读：维度/权重/信号/通过线
├── 评分指南.md      常见错误清单
├── 自评指南.md      自评步骤
├── evidence/        `npm run evidence` 生成的实测输出
├── scripts/         evidence.sh / mutation_check.mjs / db_setup.sh / run_c.sh
└── （可选）db/ fixture/ jvm/ paperA/ paperB/ 类型测试/
```

- 推荐顺序：读 `题面.md` → 写 `起始代码/` → 跑 `自测脚本/` → 对照 `参考答案/` → 按 `评分规则.json` 自评。
- 证据入口统一：`npm run evidence`（`bash scripts/evidence.sh`），同时验证「参考答案通过、起始代码被拒绝、注入缺陷被抓」。
- 每题都有 `scripts/mutation_check.mjs`：给自己写的 grader 注入受控缺陷，确认它真会失败。
- 需要数据库/浏览器的包，`evidence.sh` 在环境缺失时写 `SKIP` 并返回非 0，不伪装通过。
- 本区不含教师端/学生端隔离与防作弊设计；答案公开是自学设计的一部分。

## 关口一览（判据与依赖）

| 关口 | 判定核心 | 实测规模 | 依赖 |
| --- | --- | --- | --- |
| [G0](G0-环境与工程习惯/README.md) 环境与工程习惯 | 冲突合并 + 固定 fixture 仓库接手 | 2 + 8 条 | git |
| [G1](G1-计算机与Web基础/README.md) 计算机与 Web 基础 | 静态 a11y 检查 + 真站点 axe + HTTP 契约 + C 内存 | 2 + 6 + 8 + 探针 | Playwright、axe-core、gcc（可选） |
| [G2](G2-JavaScript与TypeScript/README.md) JavaScript/TypeScript | 有界异步池 + TS CLI + 类型门禁 | 2 + 16 + 14 条，type-coverage 100% | tsc、type-coverage |
| [G3](G3-React前端工程/README.md) React 前端工程 | 竞态 + memo 更新 + 可访问性 + 构建产物 | 2 + 6 + 4 条 | Vite 8、React 19、Playwright |
| [G4](G4-Node后端与数据库/README.md) Node.js 后端与数据库 | RBAC + 真 PG 越权/注入/乐观锁/分页/事务 | 4 + 10 条 | PostgreSQL 18 |
| [G5](G5-测试安全与性能/README.md) 测试安全与性能 | 输入校验 + 真交易库 100 并发/幂等/对账 | 3 + 15 条 | PostgreSQL 18 |
| [G6](G6-毕业项目（多租户）/README.md) 毕业项目（多租户） | 租户隔离 + 审计 before/after + 批量逐项 + 软删 + expand | 3 + 14 条 | PostgreSQL 18 |
| [G7](G7-中线技术栈与多语言交付/README.md) 中线技术栈与多语言交付 | 契约对照 + MySQL 隔离/锁/死锁 + JVM 线程死锁 | 3 + 7 条 + JVM | MySQL 8.4 @3307、JDK 25 |
| [G8](G8-陌生系统接手与团队交付/README.md) 陌生系统接手与团队交付 | 遗留数据修复 + 固定旧系统 7 缺陷（基线先行） | 2 + 15 条 + 基线 | PostgreSQL 18 |
| [G9](G9-综合实操/README.md) 综合实操 | A/B 双卷 + 12 小时计时 + 100 分制自评 | 3 + 14 + 13 条 | 无（纯函数） |

每包的 `README.md` 里都有该题的判据表（编号 → 判据 → 抓的缺陷）与实测数字。

## 专题题库

| 专题 | 内容 | 入口 |
| --- | --- | --- |
| SQL50 | 50 道 PostgreSQL 题、schema/seed、逐题结果比对判定 | [SQL50](专题题库/SQL50/README.md) |
| RAG Golden Set | 65 条 golden 样本（检索/拒答/越权/注入/成本）与离线评测 | [RAG-GoldenSet](专题题库/RAG-GoldenSet/README.md) |
| 后端实操 30 | API 契约/对象级授权/并发/Outbox/JVM 诊断，每题起始代码+公开判定测试 | [后端实操30](专题题库/后端实操30/README.md) |
| 全英文面试 10 | 10 套 60 分钟全英文面试题包、四维评分与记录模板 | [全英文面试10套](专题题库/全英文面试10套/README.md) |
| 国内大厂真题 | 六家公司共 250 题，全部来自 CodeTop 公开面经统计 | [国内大厂真题](国内大厂真题/README.md) |

## 本地环境（跑真实环境层需要）

| 依赖 | 本机位置/端口 | 用途 |
| --- | --- | --- |
| PostgreSQL 18.6 | `127.0.0.1:5432`，账号 `study` / `study_lab` | G4/G5/G6/G8 |
| MySQL 8.4.13 | `127.0.0.1:3307`，库 `g7_lab` | G7 |
| JDK 25 | `D:/JAVA/jdk` | G7 JVM 题 |
| MinGW gcc 15.2 | `/c/mingw64/bin/gcc` | G1 C 题（无 `-lasan`） |
| Playwright 1.65 | `D:/dev-cache/ms-playwright` | G1 站点、G3 应用 |

## 边界

- 这些包只覆盖各关口**可自动断言的核心子项**，不替代完整项目、口头答辩或外部评估；自测通过不等于 G 关口自动通过。
- 自评以各包 `自测脚本/` 的 grader 为准，`评分规则.json` 用于定位薄弱点；答案与脚本全部公开，不构成防作弊考试。
- 环境缺失时 `evidence.sh` 会 `SKIP` 并返回非 0；`[未实测]` 项在 `04-资源与评估/项目审计与优化报告.md` 第十八节列明。
