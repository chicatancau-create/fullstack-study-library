# G9 故障变体（第二套抽测）

在答案上制造受控缺陷，确认对应自测脚本会失败；修复后再次通过。

## A 卷（改 `paperA/参考答案/index.mjs`）

| 编号 | 注入缺陷 | 应失败的断言 | 已实测输出 |
| --- | --- | --- | --- |
| A-tz | `toMs` 不解析时间，直接拿字符串比较 | `A1 已接受预约` | `[] != ["b1","b5","b7","b8","b9"]` |
| A-hold | 删掉过期 hold 的拒绝分支 | `A1 已接受预约` | `["b1","b10","b5",...] != [...]`（b10 混进 accepted） |
| A-dep | 删掉 `dependsOn` 检查 | `A10 依赖未满足被拒` | `[] != ["dep:blocked","ok:blocked"]` |

## B 卷（改 `paperB/参考答案/index.mjs`）

| 编号 | 注入缺陷 | 应失败的断言 | 已实测输出 |
| --- | --- | --- | --- |
| B-idem | 幂等键不再去重 | `B1 种子事件流可执行` | `illegal_transition:rejected->paid`（重放先撞状态机） |
| B-paid | 支付事件不去重 | `B1 种子事件流可执行` | `illegal_transition:paid->paid` |
| B-fsm | 状态机不再校验迁移 | `B5 非法迁移抛错` | `false != true` |

6 条全部由 `scripts/mutation_check.mjs` 自动复现，`npm run evidence` 写进 `evidence/mutation.txt`。

> B-idem / B-paid 的失败**先**落在 B1 而不是 B2/B3：因为重放会让订单再从 `rejected`/`paid` 走一次迁移，先被状态机拦住。两者都证明“缺陷被抓住”，所以断言写成 `B1|B2`、`B1|B3` 二选一。

## 手工变体（需你自己跑）

| 编号 | 注入缺陷 | 观察点 |
| --- | --- | --- |
| A-order | 并发比较器只用 `createdAt`，相同就保持输入顺序 | 把同 `createdAt` 的两条互换输入顺序，看 `accepted` 是否变化（应当是“按 id 定序、结果稳定”） |
| B-recon | 对账里用 `find` 嵌套遍历 | 1000 单时记录耗时（应当明显劣于 Map 版） |

## 记录模板

```
变体编号：B-fsm
缺陷描述：去掉 TRANSITIONS 校验，任何迁移都放行
失败断言：B5 非法迁移抛错
复现命令：node 自测脚本/grade-paper-b.mjs <变体>
失败输出：FAIL B5 非法迁移抛错: false != true
修复后输出：checks=13 fails=0
```
