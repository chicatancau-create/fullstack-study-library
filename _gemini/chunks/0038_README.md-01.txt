# E02：异步执行、取消与背压 —— 有并发上限的 Node 任务池

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E02。
> **本实验只提供 G2 中"异步调度与取消"这一项的证据**，不覆盖 G2 要求的"陌生小程序独立实现"；也不覆盖 G4 要求的真实数据库与 Owner 竞态。因此**不能据此把 G2 或 G4 标为通过**。
> 记录日期：2026-11-07｜执行环境：Windows + Node v22.22.2（零依赖）

## 1. 这次做了什么、没做什么

做了什么：

- 从零实现 `TaskPool`：并发上限、队列硬上限、超时、`AbortSignal` 取消、failFast、`waitForSlot` 等位背压（零第三方依赖）。
- 批次 1：修复 `maxQueue=0` 空池 `waitForSlot` 永久 pending、`close` 遗留队列、`failFast` 对假值异常失效、abort 监听器与 drain waiter 清理；补齐 `timeoutMs` 参数矩阵和取消×超时交错；新增 37 条回归断言，`run_all.sh` 缺 PASS、`not ok`、场景不成立均非零。
- 用**闸门逐拍放行**的方式做出确定性乱序完成，并重复 5 次确认顺序不漂。
- 记录首项失败瞬间"谁在跑、谁在排"，并验证失败后不再接收新任务。
- 验证取消后**所有调用方 Promise 都在百毫秒内结算**，同时底层函数仍在跑、槽位仍被占用。
- 验证超时只让调用方停止等待，底层在超时之后才真正结束。
- 做三个反例（无界并发、同步忙循环、生产快于消费）并做前后测量。

没做什么（避免夸大）：

- 已补 worker_threads 对照：本机 4 个 CPU 密集任务加速 1.85–2.76x；CI 2 核只强制断言事件循环响应，加速比标记 SKIPPED_LOW_CORE。见 `scenarios/worker_threads.mjs` 与 `evidence/worker_threads.txt`。
- 没有接真实数据库/HTTP 客户端，"下游调用"用 `setTimeout` 代表，因此**吞吐与延迟不是本实验结论**。
- 已做父进程经 IPC 取消子进程任务的协议（`src/cancel-child.mjs`）；没有做多主机/分布式取消。
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
node        : v24.15.0   v8 13.6.233.17-node.48   uv 1.51.0
cpus        : 32（availableParallelism=32）
UV_THREADPOOL_SIZE : 未设置（默认 4）
依赖        : dependencies / devDependencies 均为空，无 node_modules
特征        : AbortController / AbortSignal.timeout / AbortSignal.any / structuredClone /
              worker_threads / monitorEventLoopDelay / process.getActiveResourcesInfo 均可用
```

"干净"的含义：没有任何第三方包，`npm ls` 为空，全部代码在本目录内可读。环境原始输出见 `evidence/env.txt`，由 `scripts/env.mjs` 真实执行得到，不转抄结论。

2026-11-07 批次 1：六个测试与门禁在 Node **v24.15.0** 重跑，172 条断言全通过；`evidence/env.txt` 当前记录 v24.15.0。v22.22.2 的原始记录见提交 `8afe598`，不再作为当前环境。下面关于 Windows 定时器粒度的读数来自原始 v22 环境，v24 未单独重测。

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
bash scripts/run_all.sh       # 采集 evidence/，缺测试/缺 PASS/not ok/场景不成立均非零
bash scripts/selftest_gate.sh # 主动破坏一次，确认门禁会红
node ../_template/manifest.mjs verify evidence/manifest.json  # 证据文件存在且 SHA-256 一致
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
