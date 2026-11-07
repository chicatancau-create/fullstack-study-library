# E02：异步执行、取消与背压 —— 有并发上限的 Node 任务池

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E02。
> **本实验只提供 G2 中"异步调度与取消"这一项的证据**，不覆盖 G2 要求的"陌生小程序独立实现"；也不覆盖 G4 要求的真实数据库与 Owner 竞态。因此**不能据此把 G2 或 G4 标为通过**。
> 记录日期：2026-11-07｜执行环境：Windows + Node v22.22.2（零依赖）

## 1. 这次做了什么、没做什么

做了什么：

- 从零实现 `TaskPool`：并发上限、队列硬上限、超时、`AbortSignal` 取消、failFast、`waitForSlot` 等位背压（零第三方依赖）。
- 用**闸门逐拍放行**的方式做出确定性乱序完成，并重复 5 次确认顺序不漂。
- 记录首项失败瞬间"谁在跑、谁在排"，并验证失败后不再接收新任务。
- 验证取消后**所有调用方 Promise 都在百毫秒内结算**，同时底层函数仍在跑、槽位仍被占用。
- 验证超时只让调用方停止等待，底层在超时之后才真正结束。
- 做三个反例（无界并发、同步忙循环、生产快于消费）并做前后测量。

没做什么（避免夸大）：

- 没有做 worker_threads 版本：CPU 密集任务的真正并行不在本实验范围，只在反例里指出方向。
- 没有接真实数据库/HTTP 客户端，"下游调用"用 `setTimeout` 代表，因此**吞吐与延迟不是本实验结论**。
- 没有做跨进程/分布式取消（那需要协议，不是单进程 API）。
- 没有测量 `--max-old-space-size` 边界，堆增长只做量级参考。

## 2. 假设（可证伪）

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 只要把 `Promise.all` 换成有并发上限的池，就能控制住下游压力 | 200 个任务分别走无界 `Promise.all` 与 `concurrency=20` 的池，看并发峰值 | **成立但需完整语义**：峰值从 200 降到 20；代价是总耗时从约 105ms 升到约 1086ms。只换 API 不改队列语义仍会积压（见 H3） |
| H2 | 取消一个任务后，它的槽位会立刻让给下一个 | `concurrency=1`，取消正在跑的任务，看下一个是否立即开始 | **不成立**：槽位在底层函数结算前不释放，后续任务继续排队。这是刻意的 —— 否则实际并发会超过上限 |
| H3 | 队列有上限 + 生产端不等位，系统仍然可控 | 2000 条同步提交到 `maxQueue=32` 的池 | **不成立**：1960 条被 `E_QUEUE_FULL` 拒绝（98.0%）。有界了，但任务丢了；必须配合 `waitForSlot` 或显式降级 |
| H4 | 设了 `timeoutMs` 就等于底层操作被中止 | 60ms 超时、底层 300ms 才结束，检查槽位与完成时刻 | **不成立**：超时只拒绝调用方；槽位仍被占，底层在超时后自行完成。统计中记为"超时后完成" |
| H5 | 并发上限等于并行 | 4 个 100ms 同步忙循环交给 `concurrency=4` 的池 | **不成立**：总耗时 401ms ≈ 4×100ms，实际串行。同一批任务改为 await 定时器后总耗时 105ms |
| H6 | 同步忙循环期间，超时定时器仍会按时触发 | 排一个 20ms 定时器，紧接着 300ms 同步忙循环 | **不成立**：定时器实际晚到 280ms。阻塞期间超时判定一并冻住 |

## 3. 干净环境

```text
OS          : Windows 10.0.28000 x64
node        : v22.22.2   v8 12.4.254.21-node.39   uv 1.51.0
cpus        : 32（availableParallelism=32）
UV_THREADPOOL_SIZE : 未设置（默认 4）
依赖        : dependencies / devDependencies 均为空，无 node_modules
特征        : AbortController / AbortSignal.timeout / AbortSignal.any / structuredClone /
              worker_threads / monitorEventLoopDelay / process.getActiveResourcesInfo 均可用
```

"干净"的含义：没有任何第三方包，`npm ls` 为空，全部代码在本目录内可读。环境原始输出见 `evidence/env.txt`，由 `scripts/env.mjs` 真实执行得到，不转抄结论。

2026-11-07 批次 0 在 Node **v24.15.0** 的临时副本中复跑 `bash scripts/run_all.sh`，五组仍为 **135/135**、退出码 0；`evidence/env.txt` 保留原始 v22.22.2 记录，不覆盖。下面关于 Windows 定时器粒度的读数来自原始 v22 环境，跨版本复验时仍需重测。

`evidence/env.txt` 里两条环境事实会直接影响读数，先写在这里：

1. **Windows 定时器粒度约 15.6ms**：`setTimeout(20)` 实测约 31ms。所以本文所有绝对耗时只用于横向比较，不当性能指标。
2. **`AbortSignal.timeout` 的内部计时器是 unref 的**：若事件循环没有其他 ref 资源，进程会直接退出、abort 永不触发（本机实测 exit=0 且无任何输出）。超时装置既不保活进程，也不保证在超时点一定执行回调。

## 4. 输入

不是外部数据，而是用例矩阵 + 可控闸门：

| 类别 | 输入 | 覆盖点 |
| --- | --- | --- |
| 并发上限 | 9 个任务、`concurrency=3` | 同时在跑恒为 3，峰值不越界 |
| 调度顺序 | 4 个任务、`concurrency=1/2/4` | 启动顺序 = 提交顺序（FIFO），完成顺序由闸门决定 |
| 队列上限 | `maxQueue=2` / `maxQueue=0` / `maxQueue=32` | 满即拒绝；有空槽时不受队列额度限制 |
| 首项失败 | `concurrency=2`、失败任务 + 1 个慢任务 + 3 个排队 | 失败瞬间的快照、排队任务丢弃、在跑任务跑完 |
| 取消 | 5 个任务，分别在排队态与执行态 abort | 结算时机、槽位占用、底层是否仍在跑 |
| 超时 | `timeoutMs=20/30/60/200/300` | 超时后底层完成、槽位占用、迟到抛错 |
| 速率 | 生产 2000 条 vs 消费 8 并发；三档生产间隔 | 队列与并发是否仍有界 |

## 5. 执行命令

```bash
cd 06-实验代码/E02-node-async
bash scripts/run_all.sh      # 采集 evidence/ 下全部证据
```

单独跑某一项：

```bash
node tests/test_pool.mjs       # 基础语义：上限 / FIFO / 队列上限 / 关闭 / 同步异常
node tests/test_ordering.mjs   # 确定性乱序完成
node tests/test_failure.mjs    # 首项失败
node tests/test_cancel.mjs     # 取消结算
node tests/test_timeout.mjs    # 超时语义
node --expose-gc scenarios/cx_unbounded_concurrency.mjs
node scenarios/cx_busy_loop.mjs
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
| 无界并发反例 | 峰值随提交量线性增长 | 峰值 200 = 提交量 200 | 符合（正是危险点） |
| 忙循环反例 | 定时器被拖后、并发不并行 | 晚到 280ms；4×100ms 任务耗时 401ms | 符合 |
| 生产快于消费反例 | 无界队列堆积到全量 | 队列峰值 2000 条；有界版 pending 峰值 40 | 符合 |
| 速率对照 | 三档都仍有界 | 三档 pending 峰值 20/1/1，上界 20 | 符合 |

合计 135 条断言，0 失败；同时断言"未产生 unhandledRejection"，即所有拒绝都被显式处理。

## 7. 任务池的三条语义

这三条是设计约束，不是实现细节，README 后续每一节都在验证它们：

1. **取消与超时只让调用方停止等待，不撤销底层操作。** JS 没有抢占式取消。已经发出的请求、已提交的写、没有 await 的同步代码都不会回滚。
2. **底层函数结算前不释放槽位。** 否则"取消了 5 个"会让实际并发冲到 5 个以上，比不取消更失控。
3. **队列有硬上限，满即拒绝。** 需要等位时由生产端 `await pool.waitForSlot()`，把压力传回生产端。

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
# 全部结算耗时 0.07ms（取消不等待底层）
ok - 取消：5 个承诺全部 rejected
ok - 清理：五个底层函数都真实跑完了            t0,t1,t4
ok - 清理：被取消的 t2/t3 确实没有执行
```

这条证据里最重要的是两组数字的对比：**调用方全部结算用了 0.09ms，而底层 3 个函数在之后才陆续跑完。** 如果把"取消"实现成"等底层结束再 reject"，调用方就会被拖住 —— 那才是真正的无界等待。

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
C. 反例：4 个 100ms 忙循环，concurrency=4   并发峰值 4，总耗时 401.0ms ≈ 4×100ms
D. 对照：同样 4 个任务改为 await 定时器     总耗时 108.5ms
```

C 与 D 的对比是这一节的核心：**同一个池、同一个并发上限，差别只在任务是否让出线程。** 所以"并发上限"管的是在飞任务数，不是 CPU 并行度。

B 还带出一个容易被忽略的推论：同步阻塞期间 `timeoutMs` 不会触发。有超时配置 ≠ 会在超时时间点被叫醒。

### 11.3 生产快于消费（`evidence/cx_fast_producer.txt`）

```text
A. 无界队列（数组直接 push）
   队列峰值 2000 条 = 生产量；消费完 2000 条
B. 有界队列 + 满即拒绝（E_QUEUE_FULL）
   pending 峰值 40（上界 40）；被拒 1960 条（98.0%）；实际执行 40 条
C. 有界队列 + waitForSlot 等位
   pending 峰值 40（上界 40）；生产方被迫等待 1960 次，累计阻塞 9.79ms
   2000/2000 条全部执行，无丢弃
```

三者都能跑完，区别在**失控时表现成什么**：无界队列把失控变成内存与尾延迟；拒绝把失控变成丢任务；等位把失控变成生产端变慢。只有后两者有上界。

丢 98% 的任务不是 bug，是这个配置下的必然结果 —— 所以要么调大队列，要么用等位，要么显式降级，不能"设了 maxQueue 就当背压做完"。

## 12. 背压：改变生产/消费速率后是否仍有界

判定标准写在跑之前：`pending <= concurrency + maxQueue = 20`。

```text
档位              提交   生产耗时(ms)  总耗时(ms)  pending峰值  running峰值  队列峰值  等位次数  pending<=20
生产远快于消费            600          5.8         6.3           20            4        16       580  YES
生产接近消费             300          2.1         2.2            1            1         0         0  YES
生产慢于消费              60        924.3       924.3            1            1         0         0  YES
```

三档全部满足：pending 峰值 ≤ 20、running 峰值 ≤ 4、结束后 `running/queued` 归零、任务全部完成无丢弃。

两点读法：

- **生产远快于消费**时 pending 卡在 20 不再涨，生产端被 `waitForSlot` 拖慢（580 次等位）。队列是缓冲，不是仓库。
- **生产慢于消费**时 pending 只有 1，池在空转，此时把 `maxQueue` 调大没有任何收益 —— 参数要跟着瓶颈走。

## 13. 边界：这套装置**没有**证明什么

1. **没有证明"取消能终止副作用"。** 底层拿到 `signal` 后是否真的停止，取决于它自己是否协作；池只管调用方不再等。数据库已提交的写、已发出的请求都不会因为 reject 而回滚。
2. **没有证明吞吐或延迟。** "下游调用"是 `setTimeout`，没有网络、没有真实连接池，绝对耗时不具代表性。
3. **没有覆盖多进程/分布式取消。** 单进程内的 `AbortController` 到不了另一个进程，跨服务取消需要协议。
4. **没有覆盖 CPU 密集任务的真正并行。** 反例只指出方向（worker_threads/子进程），没有实现，也没有测 worker 启动与消息序列化成本。
5. **没有测量内存上限。** 堆增长采样受 GC 时机影响，只能看量级，不能当泄漏证据。
6. **`waitForSlot` 只在队列满时唤醒。** 若任务长期不结束、队列长期满，生产端会一直等 —— 这是背压的本意，但调用方必须自己加超时或取消，池不代劳。
7. **failFast 的原子性未覆盖。** 快照取的是失败函数结算那一刻的状态；多任务几乎同时失败时，只有第一个会触发丢弃，其余按普通失败处理。

所以本实验**不声称"并发正确"**，只声称："在给定装置下，这四类语义（上限、乱序、失败、取消/超时）被稳定复现、可用断言复核、并且有明确边界。"

## 14. M / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M01 编程与算法 | 部分 | 状态机（queued/running/settled 的迁移）、边界（maxQueue=0）、不变量（running ≤ concurrency）、异常路径 |
| M02 系统与网络 | 部分 | 事件循环、定时器粒度、同步阻塞对回调的影响；网络 I/O 本身不在 E02 |
| G2 | **仅"异步调度/取消"一项** | G2 = 陌生小程序独立实现 + 失败测试。本实验提供调度与失败测试的手法，没做陌生小程序 |
| G4 | 前置思路 | 并发上限与有界资源的建模方式可迁移到连接池/库存扣减，但 G4 要求真实 DB、Owner 竞态与迁移验证，本实验一项未覆盖 |

结论：**E02 完成 ≠ G2 通过，更 ≠ G4 通过。** G2 的判定要等一个陌生小程序从零实现并带失败测试；G4 要等 E07/E08 与项目 02。

## 15. 目录结构

```text
E02-node-async/
├── src/
│   ├── pool.mjs              任务池：并发上限 / 队列上限 / 超时 / 取消 / failFast / waitForSlot
│   └── measure.mjs           事件循环延迟采样、堆采样、闸门、waitUntil
├── tests/
│   ├── tapmini.mjs           断言与计数，输出格式对齐 E01（ok / not ok / checks=.. : PASS）
│   ├── test_pool.mjs         上限、FIFO、队列上限、关闭、同步异常、参数校验
│   ├── test_ordering.mjs     确定性乱序完成 + 5 次重复一致性
│   ├── test_failure.mjs      首项失败快照与丢弃语义（含 failFast 关闭的对照）
│   ├── test_cancel.mjs       排队态/执行态取消、全部结算、资源清理
│   └── test_timeout.mjs      超时≠撤销、槽位占用、迟到抛错、上界组合
├── scenarios/
│   ├── cx_unbounded_concurrency.mjs  反例 1：无界并发
│   ├── cx_busy_loop.mjs              反例 2：同步 CPU 忙循环
│   ├── cx_fast_producer.mjs          反例 3：生产快于消费
│   └── backpressure_rates.mjs        三档速率下的有界性
├── scripts/
│   ├── env.mjs               环境与特性探测（真实执行）
│   └── run_all.sh            采集 evidence/ 下全部证据
├── evidence/                 真实运行输出，提交入库
└── package.json              零依赖，engines.node >= 20
```

## 16. 复现与判读

```bash
rm -rf evidence && bash scripts/run_all.sh && cat evidence/test_run.txt
```

判读顺序：

1. `evidence/test_run.txt` 五个测试是否全为 PASS，且失败项区显示"无"。
2. `evidence/test_failure.txt` 是否有 `快照 running=... queued=...` 这一行 —— 没有这一行就说明没抓到失败瞬间的状态，等于没测。
3. `evidence/test_cancel.txt` 的"全部结算耗时"是否是毫秒级，而"五个底层函数都真实跑完了"是否同时成立。两个条件缺一，取消语义就不成立。
4. `evidence/test_timeout.txt` 是否同时有"槽位仍被底层占着"和"记录了一次迟到的底层完成"。少任何一个，就说明超时被误当成了撤销。
5. `evidence/backpressure_rates.txt` 三档是否都是 `YES`。

任一步缺失都不算通过。**通过 E02 也不等于 G2/G4 通过**，见第 14 节。
