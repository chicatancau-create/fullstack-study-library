# G2 故障变体（第二套抽测）

在答案上制造受控缺陷，确认对应 grader 会失败；修复后再次通过。

## TS 池（改 `参考答案/ts/pool.ts`）

| 编号 | 注入缺陷 | 应失败断言 | 已实测输出 |
| --- | --- | --- | --- |
| V1 | `pump` 循环放宽到 `<= limit` | `并发上限=2 峰值不超` | `3 != 2` |
| V3 | 队列满判断用 `>` 代替 `>=` | `队列满时拒绝` | `应当拒绝但成功了` |
| V4 | `limit` 下界从 1 放宽到 0 | `limit=0 抛 RangeError` | `没有抛错` |
| V5 | `stats` 直接返回内部对象 | `stats 快照不被外部污染` | `99 != 0` |

四条由 `scripts/mutation_check.mjs` 自动复现，`npm run evidence` 写进 `evidence/mutation.txt`。

## CLI（手工）

| 编号 | 注入缺陷 | 应失败断言 |
| --- | --- | --- |
| C1 | 未知参数不报错 | `未知参数退出码 2` |
| C2 | `--limit` 缺值给默认值 | `--limit 缺值退出码 2` |
| C3 | schema 错误归到退出码 4 | `顶层不是数组退出码 3` |
| C4 | 取消后已排队任务仍 `ok` | `取消后有任务被标记 cancelled` |

## 记录模板

```
变体编号：V3
缺陷描述：队列满判断改成 queue.length > queueMax
失败断言：队列满时拒绝
复现命令：node scripts/mutation_check.mjs
失败输出：FAIL 队列满时拒绝: 应当拒绝但成功了
修复后输出：checks=16 fails=0
```
