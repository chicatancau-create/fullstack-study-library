# G0 环境与工程习惯

> 自学自测包。题面、起始代码、参考答案、自测脚本、评分规则全部公开。

## 两题

1. **函数题**：实现 `resolveConflict(ours, theirs)` —— 合并两侧变更，保留双方独有行，去掉冲突标记与空行。
2. **固定 fixture 仓库题**：`fixture/` 会生成本地 bare 仓库 + bundle，里面有一个真实冲突、一处 off-by-one 缺陷、一份被忽略的合成秘密、一个脏工作区。你要把它修到能通过 `自测脚本/grade-repo.mjs`。

## 固定 fixture 仓库（本地、确定性）

```bash
FIX="${TEMP:-/tmp}/g0-fixture"
node fixture/build.mjs "$FIX"                # 生成 bare + bundle + work
git clone "$FIX/legacy.bare.git" "$FIX/learner"
cd "$FIX/learner" && git checkout main
node <仓库>/08-判定题库/G0-环境与工程习惯/自测脚本/grade-repo.mjs .   # 现在应该 FAIL（这就是基线）
```

fixture 里的合成秘密 `config/local.env` 是**假的、只为练习**的字符串，已列入 `.gitignore`；它不会被提交，也不会进入干净 clone。

`fixture/build.mjs` 用固定作者、固定日期、`* -text` 统一行尾，因此两次构建出的提交哈希相同（实测 `baseTip=99a60a2…`，`feature=918aa43…`，修复后 head `5429947…`）。

## 自测方式

| 命令 | 作用 |
| --- | --- |
| `node 自测脚本/smoke.mjs` | 冒烟：只确认函数题导出存在 |
| `node 自测脚本/grade.mjs 参考答案/index.mjs` | 函数题 2 条断言 |
| `node 自测脚本/grade-repo.mjs <工作副本>` | 仓库题 8 条断言（R1–R6） |
| `node 参考答案/solve-repo.mjs <工作副本>` | 仓库题参考修复 |
| `npm run evidence` | 全套重跑：答案通过 / 起始代码被拒 / fixture 未修被拒 / 干净 clone 无秘密 / 修复后通过 / 4 个注入缺陷被抓 |

## 仓库题的 8 条断言

| 编号 | 断言 |
| --- | --- |
| R1 | 工作树干净（无未合并路径、无未提交改动、无未跟踪文件） |
| R2 | 冲突已解且双方独有内容都保留（`LOG_LEVEL=debug` / `TIMEOUT_MS=60000` / `RETRY=5`） |
| R3 | 合成秘密未入库（`config/local.env` 不在索引） |
| R4 | HEAD 是合并提交（两个父提交） |
| R5 | `rollingSum([0,1,2,3]) === [0,1,3,6]`，`rollingSum([]) === []` |
| R6 | 仓库自带 `test/rolling_sum.test.js` 通过 |

## 评分

评分维度与权重见 `评分规则.json`（机器可读）；人工部分只用于定位薄弱点。
门槛：所有机器断言通过才算本关通过。

## 边界

- fixture 只在本地生成，不联网、不含真实凭据。
- 本包为自学设计：起手是“故意做坏”的仓库，不是考试环境。
