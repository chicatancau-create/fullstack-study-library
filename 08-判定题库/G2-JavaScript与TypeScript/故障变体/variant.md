# G2 故障变体（第二套抽测）

在答案密钥上制造一个受控缺陷，确认自测脚本会失败；修复后再次通过。记录：缺陷描述、失败的断言名、修复后的通过输出。

## 变体表

| 编号 | 注入缺陷（改 `参考答案/ts/pool.ts`） | 应失败的自测断言 | 观察点 |
| --- | --- | --- | --- |
| V1 | `pump()` 的循环条件 `state.running < limit` 改成 `< limit + 1` | `并发上限=2 峰值不超`、`四次启动时在跑数都不超过 2` | 并发上限失效，`peak` 变 3 |
| V2 | 失败回调里删掉 `pump()` | `异常后队列继续推进` | 一个任务抛错后队列卡死，后续任务永远不启动 |
| V3 | 队列满判断从 `queue.length >= queueMax` 改成 `>` | `队列满时拒绝` | 允许 `queueMax + 1` 个排队任务，不抛 `queue_full` |
| V4 | `limit` 校验从 `< 1` 改成 `< 0` | `limit=0 抛 RangeError` | `fn(0)` 不抛错，随后 `pump` 死循环 |
| V5 | `stats()` 返回 `state` 而不是 `{ ...state }` | `stats 快照不被外部污染` | 外部改快照污染内部状态 |
| V6 | 去掉 `state.queued = queue.length` 同步 | `结束后队列为空` | `queued` 始终为 0，与实际不符 |
| V7 | `run` 里先 `state.running += 1` 再判断 `running < limit` | `并发上限=2 峰值不超` | 峰值溢出一 |
| V8 | 用 `queue.unshift(start)` 代替 `push` | `FIFO 顺序` | 变成 LIFO |

## CLI 侧变体（改 `参考答案/ts/cli.ts`）

| 编号 | 注入缺陷 | 应失败的自测断言 |
| --- | --- | --- |
| C1 | `parseArgs` 未知参数分支删掉 | `未知参数退出码 2` |
| C2 | `--limit` 缺值返回默认 2 而不是抛错 | `--limit 缺值退出码 2` |
| C3 | `validateJobs` 允许 `ms < 0` | `ms 为负数退出码 3` |
| C4 | `main` 里 `SchemaError` 归到退出码 4 | `顶层不是数组退出码 3` |
| C5 | `runJobs` 不检查 `signal.aborted` | `取消后有任务被标记 cancelled` |
| C6 | 结果数组改成 `Promise.all` 后 `sort` | `--json 结果顺序与输入一致` |

## 记录模板

```
变体编号：V2
缺陷描述：失败回调删掉 pump()，异常任务后队列不再推进
失败断言：异常后队列继续推进
复现命令：node 自测脚本/grade-ts.mjs 参考答案/ts/pool.ts
失败输出：FAIL 异常后队列继续推进: 应当拒绝但成功了 / 或 超时
修复后输出：checks=16 fails=0
```
