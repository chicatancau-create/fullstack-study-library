# E06：Node 运行时诊断（CPU / 堆 / 句柄 / 事件循环）

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E06（Node 子集）。
> 本实验只覆盖单进程 Node 的诊断，不覆盖系统级进程/线程/连接池/容器，也**不代表 G5/G7 通过**。
> 环境：Windows 10.0.28000 + Node v24.15.0
> 2026-11-09 增补：`src/` 诊断模块、`tests/`、0x 火焰图、heap snapshot 对照与 retainer path、多轮堆趋势、忙循环三方案对照、`scenarios/` 文档。

## 1. 做了什么、没做什么

做了什么：

- `--cpu-prof` 采一次 300ms 同步忙循环的 CPU profile，并校验 `nodes/samples` 非空。
- `--expose-gc` 测量 20 万个保留对象的 heapUsed 增长，释放后回落。
- 创建 100 个未清理的 `setInterval`，用 `process.getActiveResourcesInfo()` 观察 Timeout 句柄增长与清理回落。
- `monitorEventLoopDelay` 记录 200ms 同步忙循环期间的最大延迟。
- 所有证据写入 `evidence/`，脚本任一环节失败非零。

没做什么：

- 没有系统级 `ps`/`lsof`/`ss`/fd 数量、没有连接池耗尽、没有容器/K8s。
- 没有真实数据库/HTTP 下游；泄漏场景是受控合成，不代表业务对象图。
- 没有生产流量/托管 Profiler UI；火焰图来自本机 0x 采样。
- worker 只对照"主线程是否被阻塞"，没有测吞吐/线程池规模。

## 1.1 完整版补充（2026-11-09）

- `src/profile.mjs`：解析 `.cpuprofile`，按样本 `timeDeltas` 聚合自耗时，输出热点函数排行。
- `src/heap.mjs`：解析 V8 `.heapsnapshot`（schema v2），统计节点/边/字符串、按构造名聚合、从 root BFS 找实例并回溯 retainer path。
- `src/loop.mjs`：`busyWait` / `chunkedCompute`（setImmediate 分片）/ `measureLoop`（monitorEventLoopDelay，含热身）。
- `tests/runtime.test.mjs`：3 条单测（热点聚合、快照 retainer path、分片不阻塞）。
- 火焰图：`node node_modules/0x/cmd.js --output-dir evidence/flame scenarios/cpu_loop.mjs`。
- 堆对照：`node --expose-gc scenarios/heap_leak.mjs` 产出 4 轮趋势 + 泄漏/修复快照 + 两份 retainer path。
- 忙循环：`scenarios/busy_fix.mjs` 对照阻塞 / 分片 / worker_threads。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 300ms 同步忙循环会出现在 CPU profile 且有 samples | `--cpu-prof` + JSON 校验 | **成立**：profile 13KB，samples 非空 |
| H2 | 200k 保留对象使 heapUsed 增长 >5MB，释放后回落 | `--expose-gc` 前后测量 | **成立**：`HEAP PASS` |
| H3 | 未清理的 interval 会让 Timeout 句柄增长，清理后回落 | `getActiveResourcesInfo()` | **成立**：`FD PASS` |
| H4 | 200ms 忙循环使事件循环 max 延迟接近 200ms | `monitorEventLoopDelay` | **成立**：max≈200ms |
| H5 | 任一诊断失败时脚本非零 | 破坏条件重跑 | 已由 gate 结构保证（每个命令 rc 检查） |

## 3. 环境

```text
OS   : Windows 10.0.28000 x64（Git Bash）
Node : v24.15.0
依赖 : 无（只用 node:perf_hooks / process / console）
```

## 4. 执行命令

```bash
cd 06-实验代码/E06-runtime-diag
bash scripts/run_evidence.sh
echo $?          # 期望 0
```

单独：

```bash
node --test tests/runtime.test.mjs
node node_modules/0x/cmd.js --output-dir evidence/flame scenarios/cpu_loop.mjs
node --cpu-prof --cpu-prof-dir=evidence/cpu scenarios/cpu_loop.mjs
node --expose-gc scenarios/heap_leak.mjs
node scenarios/busy_fix.mjs
node scenarios/fd_leak.mjs
node scenarios/event_loop_delay.mjs
```

## 5. 结果

| 项 | 实际 | 证据 |
| --- | --- | --- |
| CPU 忙循环 | 300ms，profile 13,335 bytes，samples 非空 | `evidence/cpu_loop.txt`、`evidence/cpu/*.cpuprofile` |
| 堆增长/释放 | `HEAP PASS`（增长 >5MB，释放后回落） | `evidence/heap.txt` |
| 句柄 | Timeout before/during/after 增长后回落 | `evidence/fd.txt` |
| 事件循环 | max≈200.4ms，mean≈42.7ms | `evidence/eventloop.txt` |
| 汇总 | `gate_failures: 0` | `evidence/run.txt` |
| 火焰图 | `evidence/flame/flamegraph.html`，热点为 `cpu_loop.mjs` 匿名函数（约 289ms） | 0x 采样 + `evidence/cpu-hot.txt` |
| 堆快照 | 4 轮 4.44→12.04MB，清理后 4.21MB；泄漏快照 retainer path 含 `LeakBuffer(object)` | `evidence/heap-leak.txt`、`evidence/heap/*.heapsnapshot` |
| 忙循环修复 | 阻塞 200.5ms → 分片 25.7ms → worker 20.4ms（主线程 max） | `evidence/busy-fix.txt` |
| 单测 | 3/3 通过（热点聚合、retainer path、分片不阻塞） | `evidence/test.txt` |

## 6. 诊断顺序（本实验验证的判据）

1. **CPU 忙**：事件循环延迟升高 + CPU profile 采样集中在同一函数；先拆任务/转移 CPU，不要盲目加并发。
2. **堆增长**：保留对象导致 heapUsed 上升；释放后回落说明不是“假泄漏”；长期趋势需多次采样。
3. **句柄泄漏**：`getActiveResourcesInfo` 的 Timeout/Socket 数量持续增长；清理后回落。
4. **事件循环**：`monitorEventLoopDelay` 的 max/mean 能量化阻塞；单次采样不能当性能基线。

## 7. 边界

1. 单进程 Node；没有系统级 fd/连接/线程诊断。
2. CPU profile 是采样；火焰图能定位同步热点，但不含原生栈与内核态。
3. GC 时机受 V8 影响；heapUsed 必须先强制 GC 再读数，快照解析自身也会占内存。
4. `getActiveResourcesInfo` 只列部分活动资源，不等于 OS 句柄总数。
5. 没有真实连接池/下游超时/容器资源限制；不能外推为生产容量结论。

## 8. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M02 系统与网络 | 部分 | 事件循环、堆、句柄；无 OS 级资源 |
| M11 性能与容量 | 部分 | 单次延迟/内存观测；无负载模型与多轮样本 |
| E06 | **本实验（Node 子集）** | 不含系统/连接池/容器 |
| G5/G7 | 不覆盖 | 无真实故障注入/恢复/生产容量 |

## 9. 目录结构

```text
E06-runtime-diag/
├── src/
│   ├── profile.mjs        .cpuprofile → 热点函数自耗时
│   ├── heap.mjs           .heapsnapshot → 统计 / 顶层聚合 / retainer path
│   └── loop.mjs           忙等 / setImmediate 分片 / 事件循环测量
├── tests/runtime.test.mjs 3 条单测
├── scenarios/
│   ├── cpu_loop.mjs       300ms 忙循环（火焰图采样目标）
│   ├── heap_leak.mjs      4 轮闭包泄漏 + 快照对照
│   ├── busy_fix.mjs       阻塞 / 分片 / worker 对照
│   ├── busy_worker.js     worker 内的忙循环
│   ├── fd_leak.mjs        Timeout 句柄增长/清理
│   ├── event_loop_delay.mjs
│   └── heap_growth.mjs    20 万对象增长/释放
├── scripts/run_evidence.sh
├── evidence/              原始输出、cpuprofile、flamegraph.html、heapsnapshot
├── evidence/flame/        0x 火焰图与采样日志
├── evidence/heap/         泄漏/修复快照
└── README.md
```

快照与火焰图由脚本生成，不手改；`evidence/heap/*.heapsnapshot` 约 5MB/份，用来复现 retainer path。