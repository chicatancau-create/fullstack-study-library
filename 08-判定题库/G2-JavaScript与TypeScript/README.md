# G2 JavaScript/TypeScript

> MS3 判定题包。题面、起始代码、参考答案、自测脚本全部公开。

## 任务

两题，同一技能族：

1. **JS 版**：有界异步池 `createPool(limit)`——并发上限、FIFO、拒绝后继续。
2. **TS 版**：陌生 TS CLI `参考答案/ts/cli.ts`——读 jobs.json，按 `--limit` 并发执行，`--queue` 限制等待队列，支持 `--json`、`--help`、信号取消；退出码 0/2/3/4/130。

TS 版另要求通过 `tsc` 严格类型检查与 `type-coverage ≥80%`。

## 自测方式

| 命令 | 作用 |
| --- | --- |
| `node 自测脚本/smoke.mjs` | 冒烟：只确认 JS 版导出存在 |
| `node 自测脚本/grade.mjs 参考答案/index.mjs` | JS 版 3 条断言（并发/FIFO/结果） |
| `node 自测脚本/grade-ts.mjs 参考答案/ts/pool.ts` | TS 池 16 条断言：并发上限、FIFO、拒绝后继续、队列满、`limit` 非法、多轮 `await` 交错、`stats` 快照不可污染 |
| `node 自测脚本/grade-cli.mjs` | CLI 14 条验收：帮助/退出码/未知参数/schema/队列满/取消/并发生效 |
| `npm run typecheck` | `tsc -p tsconfig.json` 零错误（起始代码 + 参考答案 + `类型测试/` 类型层断言） |
| `npm run type-coverage` | 类型覆盖率 ≥80%（实测 99.32%，439/442） |
| `npm run evidence` | 全套重跑并写 `evidence/`，同时验证“答案通过、起始代码被拒绝” |

`evidence.sh` 会依次产出 `judge-solution.txt`、`judge-starter.txt`、`ts-solution.txt`、`ts-starter.txt`、`cli-acceptance.txt`、`typecheck.txt`、`type-coverage.txt`，最后打印 `SELF-TEST PASS`。

## 评分 rubric

| 维度 | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| 核心不变量 | 未实现 | 部分路径 | 主路径正确 | 主路径 + 边界/反例 |
| 失败处理 | 静默吞错 | 抛错但无上下文 | 明确错误 | 可复现 + 回归测试 |
| CLI 契约 | 无 | 只跑主路径 | 参数与退出码齐 | schema/队列满/取消全覆盖 |
| 类型质量 | 无类型 | 有 `any` | 严格零错误 | 严格 + 类型覆盖率 ≥80% |
| 可读性 | 无法读 | 命名混乱 | 结构清楚 | 小而清晰、无冗余 |
| 自测脚本 | 0 通过 | 部分通过 | 全部通过 | 全部通过且改动最小 |

自测门槛：`grade.mjs`、`grade-ts.mjs`、`grade-cli.mjs`、`typecheck`、`type-coverage` 全部通过；自评按上方 rubric 打分，自评结果只用于定位薄弱点。

## 边界

- 本包只判 G2 的核心可自动断言部分，不替代完整项目与口头答辩。
- 本包为自学设计：题面、起始代码、参考答案、自测脚本全部公开，不含隔离或防作弊。
- 队列满语义按 `queueMax` 计：只统计“已满且仍在等”的排队任务，`queueMax=0` 表示不排队。
