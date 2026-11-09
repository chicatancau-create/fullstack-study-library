# 反例 02：堆涨了，却找不到谁在持有

## 症状

RSS/heapUsed 一轮比一轮高，重启就好；只知道"内存泄漏"，不知道是哪段闭包、哪个数组、哪条引用链。

## 装置

`scenarios/heap_leak.mjs` 每轮把「捕获 16KB 数组的闭包」和命名类 `LeakBuffer` 实例放进模块级数组，跑 4 轮；用 `--expose-gc` 在每轮后强制 GC 再读 `heapUsed`，最后用 `v8.writeHeapSnapshot()` 写泄漏/修复两份快照。

`src/heap.mjs` 解析 V8 snapshot（schema v2）：统计节点/边/字符串、按构造名聚合、从 root BFS 找 `LeakBuffer(object)` 实例并回溯 retainer path。

## 实测

```text
base: 4.44MB
round-1: 6.34MB
round-2: 8.24MB
round-3: 10.14MB
round-4: 12.04MB
清理后: 4.31MB

retainer path(leaked): (GC roots) -> ... -> system / Context -> Array -> LeakBuffer(object,40B)
retainer path(fixed): (not found，符合清理预期)
```

判读：

- 每轮稳定 +1.9MB，强制 GC 也不回落 → 是可达对象，不是垃圾回收滞后。
- 修复只需把持有数组清空（`store.length = 0`），堆回落到基线，修复快照里再也找不到实例。
- 快照里 `LeakBuffer` 还会以字符串/类构造函数形式出现，**必须按节点类型只匹配 object 实例**，否则会误报"修复后仍泄漏"。

## 常见误判

- 用 `heapUsed` 单点判断泄漏：不先 GC 会把普通垃圾当成泄漏。
- 只看快照文件尺寸：本例泄漏/修复快照体积接近（5.5MB vs 5.3MB），差异在可达性而不在文件大小。
- 在解析快照的同一进程里测修复后内存：JSON 解析本身占几十 MB，会掩盖回落；应先测趋势，再解析快照。

## 修复

1. 长生命周期容器（缓存、监听器表、全局 Map）必须有淘汰策略或显式清理。
2. 闭包只捕获必需字段，不要把大对象/整个上下文拖进回调。
3. 修复后用同一脚本复跑：多轮趋势应持平，修复快照里目标实例不可达。

## 自检

```bash
cd 06-实验代码/E06-runtime-diag
node --expose-gc scenarios/heap_leak.mjs
cat evidence/heap-leak.txt
```
