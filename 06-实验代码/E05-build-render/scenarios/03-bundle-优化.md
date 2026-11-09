# 反例 03：把所有代码塞进入口 chunk

## 症状

首屏只需要标题和列表，却要下载整个实验面板；首屏 JS 体积随页面数量线性增长；某次改动让所有 chunk hash 全变。

## 对照装置

- `index.baseline.html` → `src/main.baseline.tsx` → `AppLab`，静态 `import LabPanel`。
- `index.html` → `src/main.tsx` → `App` + `React.lazy(() => import('./lab/LabPanel'))`。

两套构建用同一份源码、同一 `minify=esbuild`、同一 `sourcemap=true`，只差引入方式。

## 实测（`evidence/bundle-compare.txt`，2026-11-09）

```text
baseline : entry=assets/index.baseline-*.js raw=224531B gzip=70203B chunks=1
optimized: entry=assets/index-*.js          raw=223602B gzip=70074B chunks=2
入口节省: 929B（0.4%）；动态 chunk: 1 个
tree-shaking: baseline/optimized 均不含 "UNUSED_MARKER_7f3a"
budget: 入口 gzip <= 150000B，实际 70074B => PASS
```

判读：

- 这个 demo 的面板只有 2.6KB，所以入口只省 0.4%；React 本体（约 220KB raw）仍在共享入口里。**数字小是页面本身小，不是机制没生效**。
- 真正的收益在"路由级页面"：每个页面都有独立数据与组件时，懒加载会把页面代码移出入口，入口只保留壳与路由。
- 动态 chunk 的独立 hash 让业务页面改动不会使入口缓存失效。
- 未使用导出（`unusedDeadCode`）在两套产物里都不存在，说明 tree-shaking 生效；验证方式是扫描产物里刻意留下的标记字符串。

## 常见误判

- 以为 `import()` 一定减小总字节：它主要改变**首屏加载量**与缓存粒度，总字节可能略增（多一个 chunk 的包装开销，本例 +1.8KB raw）。
- 以为 sourcemap 是"调试用、可以关"：生产排错与 bundle 分析都依赖它；它单独成 `.map` 文件，不进入首屏下载。
- 把大依赖静态 `import` 到入口，再对小组件做 lazy：优化的是 2KB，不是 200KB。先用分析器看谁占大头。
- 只做压缩不做拆分：minify/gzip 降低传输量，但不改变"首屏必须下载整包"。

## 修复清单

1. 入口保持最小：框架、路由壳、全局 Provider；页面与重组件用 `lazy` + `Suspense`。
2. 运行 `scripts/bundle-compare.mjs` 看入口 raw/gzip、chunk 数、tree-shaking 标记与 sourcemap 是否存在。
3. 给入口设预算（本例 150KB gzip），CI 超预算直接失败。
4. 第三方库按需引入；确认产物里没有未使用的导出与整包 polyfill。

## 自检

```bash
cd 06-实验代码/E05-build-render
node scripts/bundle-compare.mjs
cat evidence/bundle-compare.txt
```
