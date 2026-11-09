# 反例 03：用"加机器"解决单进程忙循环

## 症状

单个请求里做 200ms 同步计算，事件循环被占满：同进程其它请求排队，健康检查超时，扩容只把问题复制到更多实例。

## 装置

`scenarios/busy_fix.mjs` 用 `monitorEventLoopDelay`（resolution=5ms，先热身 50ms 让直方图计时器跑起来）测三种处理：

| 处理 | 做法 | 主线程事件循环 max |
| --- | --- | --- |
| 阻塞 | 直接 `while` 忙等 200ms | **200.5ms** |
| 分片 | `setImmediate`，10ms/片 | 25.7ms |
| worker | `worker_threads` 里忙等 | 20.4ms |

判据：阻塞的 max 接近 200ms（这是本轮实测值，机器不同会浮动），分片/worker 的 max 明显低于阻塞的 1/3。

## 常见误判

- 只说"CPU 100%"：没有对照事件循环延迟，不知道是否伤害同进程请求。
- 用 `setTimeout(fn, 0)` 分片：最小 1ms 以上，且受嵌套计时器钳制；`setImmediate` 在 I/O 之后执行，更适合切片。
- 把所有任务都丢 worker：线程启动与消息序列化有成本，短任务反而更慢；只把真正的 CPU 密集段迁出去。
- 分片不检查剩余时间：片太小会增加调度开销，片太大仍会卡住；10ms 量级是常见折中。

## 修复

1. 先测：同一段逻辑下比较"阻塞/分片/worker"的 max 与吞吐。
2. 可打断的长循环用分片，保持主线程能处理 I/O。
3. 不可打断的纯计算用 worker；主线程只做编排与结果合并。
4. 修复后复跑本脚本，确认 max 回落到可接受范围，再谈扩容。

## 自检

```bash
cd 06-实验代码/E06-runtime-diag
node scenarios/busy_fix.mjs
cat evidence/busy-fix.txt
```
