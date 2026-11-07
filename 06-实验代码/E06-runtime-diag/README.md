# E06：Node 运行时诊断（CPU / 堆 / 句柄 / 事件循环）

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E06（Node 子集）。
> 本实验只覆盖单进程 Node 的诊断，不覆盖系统级进程/线程/连接池/容器，也**不代表 G5/G7 通过**。
> 环境：Windows 10.0.28000 + Node v24.15.0

## 1. 做了什么、没做什么

做了什么：

- `--cpu-prof` 采一次 300ms 同步忙循环的 CPU profile，并校验 `nodes/samples` 非空。
- `--expose-gc` 测量 20 万个保留对象的 heapUsed 增长，释放后回落。
- 创建 100 个未清理的 `setInterval`，用 `process.getActiveResourcesInfo()` 观察 Timeout 句柄增长与清理回落。
- `monitorEventLoopDelay` 记录 200ms 同步忙循环期间的最大延迟。
- 所有证据写入 `evidence/`，脚本任一环节失败非零。

没做什么：

- 没有系统级 `ps`/`lsof`/`ss`/fd 数量、没有连接池耗尽、没有容器/K8s。
- 没有 worker_threads/子进程；没有 CPU 密集任务的真正并行方案。
- 没有真实数据库/HTTP 下游；没有内存泄漏的长期趋势。
- 没有生产流量/Profiler UI；profile 只做结构校验，不做火焰图解读。

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
node --cpu-prof --cpu-prof-dir=evidence/cpu scenarios/cpu_loop.mjs
node --expose-gc scenarios/heap_growth.mjs
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

## 6. 诊断顺序（本实验验证的判据）

1. **CPU 忙**：事件循环延迟升高 + CPU profile 采样集中在同一函数；先拆任务/转移 CPU，不要盲目加并发。
2. **堆增长**：保留对象导致 heapUsed 上升；释放后回落说明不是“假泄漏”；长期趋势需多次采样。
3. **句柄泄漏**：`getActiveResourcesInfo` 的 Timeout/Socket 数量持续增长；清理后回落。
4. **事件循环**：`monitorEventLoopDelay` 的 max/mean 能量化阻塞；单次采样不能当性能基线。

## 7. 边界

1. 单进程 Node；没有系统级 fd/连接/线程诊断。
2. CPU profile 是采样，不是完整调用树；本实验不解读火焰图。
3. GC 时机受 V8 影响；heapUsed 单次读数不是泄漏证明。
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
├── scenarios/
│   ├── cpu_loop.mjs
│   ├── heap_growth.mjs
│   ├── fd_leak.mjs
│   └── event_loop_delay.mjs
├── scripts/run_evidence.sh
├── evidence/                 原始输出与 cpuprofile
└── README.md
```