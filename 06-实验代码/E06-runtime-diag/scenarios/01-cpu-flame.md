# 反例 01：只看 CPU 使用率，不看火焰图

## 症状

`top`/任务管理器显示进程 100% CPU，但不知道是热点函数、GC、还是某个依赖；加机器或加节点只是把同一段忙等复制一份。

## 装置

- `scenarios/cpu_loop.mjs`：300ms 同步忙循环。
- 火焰图：`0x`（`clinic flame` 的底层实现）采样后生成自包含 `flamegraph.html`。
- 兜底：`node --cpu-prof` 原始 `.cpuprofile` + `src/profile.mjs` 按样本聚合自耗时。

## 实测

```text
profile=CPU.20261109.095739.9396.0.001.cpuprofile
289.98ms  (anonymous)  scenarios/cpu_loop.mjs:1
11.09ms   (program)
7.45ms    (garbage collector)
```

- 火焰图里 `cpu_loop.mjs` 的匿名函数占据几乎整条时间轴；GC 只有个位数毫秒，说明瓶颈是同步 JS，不是内存压力。
- 事件循环对照：同一段 200ms 忙循环让 `monitorEventLoopDelay` 的 max 达到 200.4ms。

## 常见误判

- 把 GC 时间当成业务热点：本例 GC 约 7ms，关掉 GC 也不会让忙等变快。
- 只看平均 CPU：平均 30% 也可能每秒阻塞 200ms，P99 延迟照样爆炸。
- 采样窗口太短：把火焰图采样放在启动阶段，只会看到模块加载。

## 修复

1. 先定位同步热点（火焰图/`--cpu-prof`），再决定是算法优化、分片还是 worker。
2. 分片用 `setImmediate`，把长任务切成 10ms 级；worker 用于真正并行的 CPU 计算。
3. 修完复跑同一采样命令，比较热点函数与事件循环 max，而不是只看"感觉快了"。

## 自检

```bash
cd 06-实验代码/E06-runtime-diag
node node_modules/0x/cmd.js --output-dir evidence/flame scenarios/cpu_loop.mjs
cat evidence/cpu-hot.txt
```
