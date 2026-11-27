bash scripts/selftest_gate.sh; echo "selftest_rc=$?"
cat evidence/test_run.txt
```

判读顺序：

1. `evidence/test_run.txt` 全部测试（数量以该文件为准）是否全为 PASS，且失败项区显示"无"。
2. `evidence/test_failure.txt` 是否有 `快照 running=... queued=...` 这一行 —— 没有这一行就说明没抓到失败瞬间的状态，等于没测。
3. `evidence/test_cancel.txt` 的"全部结算耗时"是否是毫秒级，而"五个任务均有终态、三个已启动函数跑完"是否同时成立。两个条件缺一，取消语义就不成立。
4. `evidence/test_timeout.txt` 是否同时有"槽位仍被底层占着"和"记录了一次迟到的底层完成"。少任何一个，就说明超时被误当成了撤销。
5. `evidence/backpressure_rates.txt` 三档是否都是 `YES`。
6. `evidence/gate_selftest.txt` 是否记录“破坏后 gate_exit=1”。

`run_all.sh` 与 `selftest_gate.sh` 的退出码都必须是 0；任一步缺失都不算通过。**通过 E02 也不等于 G2/G4 通过**，见第 14 节。

## 17. 批次 1 修复记录（2026-11-07）

| 问题 | 修复 | 回归证据 |
| --- | --- | --- |
| `maxQueue=0` 空池 `waitForSlot()` 永久 pending | 有空槽或队列未满立即返回；无空槽时等 `#finish` 的 `#notifySlot` | `test_regressions` 前 4 条 |
| `close({dropQueued:false})` 留下永不执行的队列 | 删除该选项，关闭时统一拒绝排队任务 | `close 忽略 dropQueued:false...` |
| `failFast` 对 `throw null/undefined/0/false/''` 失效 | 新增 `#failFastTriggered` 布尔标记，不再依赖 `#firstError` 真值 | 5 组假值 × 3 条断言 |
| `cancelAll` 后 abort 监听器残留 | `#detachAbort` 统一在取消/关闭/失败/结算/超时处移除 | 伪 signal 的 listenerCount=0 |
| drain 超时后 waiter 残留 | 超时时从 `#idleWaiters` 删除自身；`stats()` 暴露 waiter 数 | `idleWaiters=0` |
| 非法 `timeoutMs` 静默禁用超时 | `submit` 对 `NaN/负数/Infinity/非数字` 抛 `RangeError` | 5 组参数矩阵 |
| 取消与超时交错重复结算 | 超时处清理监听器；`#abortTask` 对 `timed-out` 只清理不重复 settle | `lateAfterTimeout=1`、listenerCount=0 |

`scripts/selftest_gate.sh` 在临时副本中禁用 `submit` 的 `failFastTriggered` 分支，`run_all.sh` 实测退出码 1，`test_regressions` 出现 5 个 `not ok`，并写入 `evidence/gate_selftest.txt`。这证明门禁会在实现被破坏时变红，而不是只打印。

仍未覆盖：多主机/分布式取消、真实连接池/HTTP 下游、failFast 多任务同时失败的原子性、堆上限；跨进程取消只做父子进程 IPC。E02 仍只提供 G2 的异步调度/取消一项。
