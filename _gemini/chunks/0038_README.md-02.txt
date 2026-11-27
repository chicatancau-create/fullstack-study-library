node --expose-gc scenarios/cx_fast_producer.mjs
node scenarios/backpressure_rates.mjs
```

## 6. 预期观察 vs 实际结果

| 项 | 预期 | 实际 | 判定 |
| --- | --- | --- | --- |
| `test_pool` | 全部通过 | `checks=28 fails=0 : PASS` | 符合 |
| `test_ordering` | 全部通过 | `checks=11 fails=0 : PASS` | 符合 |
| `test_failure` | 全部通过 | `checks=27 fails=0 : PASS` | 符合 |
| `test_cancel` | 全部通过 | `checks=37 fails=0 : PASS` | 符合 |
| `test_timeout` | 全部通过 | `checks=32 fails=0 : PASS` | 符合 |
| `test_regressions` | 全部通过 | `checks=37 fails=0 : PASS` | 符合 |
| 无界并发反例 | 峰值随提交量线性增长 | 峰值 200 = 提交量 200 | 符合（正是危险点） |
| 忙循环反例 | 定时器被拖后、并发不并行 | 晚到 280ms；4×100ms 任务耗时 401ms | 符合 |
| 生产快于消费反例 | 无界队列堆积到全量 | 队列峰值 2000 条；有界版 pending 峰值 40 | 符合 |
| 速率对照 | 三档都仍有界 | 三档 pending 峰值 20/1/1，上界 20 | 符合 |

合计 **135 + 37 = 172** 条断言，0 失败；同时断言"未产生 unhandledRejection"，即所有拒绝都被显式处理。

## 7. 任务池的三条语义

这三条是设计约束，不是实现细节，README 后续每一节都在验证它们：

1. **取消与超时只让调用方停止等待，不撤销底层操作。** JS 没有抢占式取消。已经发出的请求、已提交的写、没有 await 的同步代码都不会回滚。
2. **底层函数结算前不释放槽位。** 否则"取消了 5 个"会让实际并发冲到 5 个以上，比不取消更失控。
3. **队列有硬上限，满即拒绝。** 需要等位时由生产端 `await pool.waitForSlot()`，把压力传回生产端。
4. **`close()` 不接受 `dropQueued:false`。** 关闭后不会再 `pump`，留下队列等于永久 pending；排队任务统一拒绝，已在执行的允许跑完。
5. **`timeoutMs` 只接受 `null` 或 `>=0` 的有限数。** `NaN`、负数、`Infinity`、字符串在 `submit` 时抛 `RangeError`，不再静默禁用超时。
6. **`failFast` 用独立布尔标记，不靠异常真值性。** `throw null/undefined/0/false/''` 同样会停止接收新任务；`firstError` 只用于展示原值。

## 8. 失败注入一：首项失败

装置：`concurrency=2`、`maxQueue=10`、`failFast=true`，提交失败任务 `F`、慢任务 `S2`、排队任务 `S3/S4/S5`。

关键证据（`evidence/test_failure.txt`）：

```text
# 失败发生在 F；快照 running=S2 queued=S3,S4,S5
# 事件序列：F:start -> S2:start -> F:throw -> S2:done
ok - 首项失败：快照记录当时仍在执行的任务     (S2)
ok - 首项失败：快照记录当时待运行的任务       (S3,S4,S5)
ok - 首项失败：被丢弃任务从未开始执行
ok - 首项失败：已在执行的不被抢占，仍在跑
ok - 结算：S2 正常完成（不被抢占）
ok - 结算：丢弃原因统一为 E_POOL_DISCARDED，且 cause 保留首个失败
ok - 统计：真正开始执行的任务只有 2 个（F、S2）
```

结论：failFast 的处理边界是**只丢弃尚未开始的任务**。已在执行的两个里，`F` 自己失败，`S2` 按自己的节奏跑完 —— 池没有能力中断它，也不假装能。被丢弃的任务都带上首个失败的 `cause`，调用方可以据此判断是否需要重放整批。

统计里 `started=2` 同时说明另一件事：**池不做自动重试**，没有指数退避、没有隐藏的重排。

## 9. 失败注入二：取消

装置：5 个任务，`concurrency=2`；`t0` 在执行，`t2/t3` 在排队，`t1` 在执行、`t4` 在排队。逐阶段 abort。

关键证据（`evidence/test_cancel.txt`）：

```text
ok - 取消：执行中被取消的槽位仍被占用          running=2（没有因为取消而空出）
ok - 取消：两个排队的已出队                    queued 3 -> 1
ok - 取消：被取消的排队任务从未执行            started = t0,t1
ok - 取消：底层 t0 尚未结束
ok - 取消：底层结束后才让出槽位
ok - 取消：底层 t0 在取消之后仍完成了自己的逻辑
# 全部结算耗时见 evidence/test_cancel.txt（取消不等待底层）
ok - 取消：5 个承诺全部 rejected
ok - 清理：五个任务均有终态，三个已启动函数跑完 t0,t1,t4
ok - 清理：被取消的 t2/t3 确实没有执行
```

这条证据里最重要的是两组事件的对比：**调用方全部立即结算，而底层 3 个函数在之后才陆续跑完**（精确耗时以 `evidence/test_cancel.txt` 当前内容为准，会随机器状态波动）。如果把"取消"实现成"等底层结束再 reject"，调用方就会被拖住 —— 那才是真正的无界等待。

`t2/t3` 从未执行，说明排队中取消是真实有效的出队，不是打标记。

## 10. 失败注入三：超时

装置：`timeoutMs=60`，底层用闸门卡到超时之后才放行。

关键证据（`evidence/test_timeout.txt`）：

```text
# 超时发生在 71.9ms，底层此刻仍阻塞在 await 上
ok - 超时：错误码 E_POOL_TIMEOUT
ok - 超时：错误明确标注底层仍在跑（underlyingStillRunning=true）
ok - 超时：消息没有声称已撤销
ok - 超时：槽位仍被底层占着                  running=1
ok - 超时：底层最终自行结束
ok - 超时：结束时刻晚于超时拒绝时刻
ok - 记录了一次迟到的底层完成                 lateAfterTimeout=1
ok - 迟到完成没有算成 fulfilled              fulfilled=0
```

另一组证据说明这个语义的实际代价：`concurrency=1` 时，一个已超时的慢任务仍占着唯一槽位，后面的快任务只能排队（`槽位占用：快任务被堵在队列里`）。**超时不回收资源，只回收等待。**

迟到抛错也被显式处理：底层在超时后 reject，池吸收掉并计入 `lateAfterTimeout`，不产生 `unhandledRejection`。

## 11. 三个反例

### 11.1 无界并发（`evidence/cx_unbounded_concurrency.txt`）

```text
方案                      并发峰值   总耗时(ms)   事件循环延迟 max(ms)   堆增长(MB)
Promise.all（无界）              200        105.4                  11.4       -0.00
TaskPool（上限 20）               20       1086.3                  12.1        0.05
```

以下表格均为某一次运行的原样输出（对应 `evidence/` 里已提交的那份）。**毫秒数会随机器波动，峰值与计数不变**；复核时请以重跑后的 `evidence/` 为准，不要拿这里的毫秒数当回归基线。

并发峰值从 200 降到 20，代价是总耗时涨约 10 倍。**这笔交易必须自觉做出**：无界版本更快，因为它把 200 个并发同时压给下游。本例用定时器代表下游，所以"打满"看不见；换成连接池、文件句柄或上游限流，200 个并发就是连接耗尽或 429。

### 11.2 同步 CPU 忙循环（`evidence/cx_busy_loop.txt`）

```text
A. 对照：15 个 20ms 定时器依次等待        事件循环延迟 max=6.34ms
B. 反例：排一个 20ms 定时器 + 300ms 忙循环  定时器实际晚到 280.3ms
