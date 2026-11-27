# E05：构建产物、SSR 对照与静态缓存

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E05。
> 本实验只覆盖“构建产物 + CSR/SSR 首屏 + 静态缓存”这一子集，不覆盖 hydration/路由懒加载/真实 CDN/性能测量，也**不代表 G3 或 G6 通过**。
> 环境：Windows 10.0.28000 + Node v24.15.0 + React 19.3.1 + Vite 8.3.6 + Vitest 5.1.0
> 2026-11-09 增补：reconciliation、memo 边界、React Profiler、bundle 对照（tree-shaking / 动态导入 / chunk / minify / sourcemap / 预算）与 `scenarios/`。

## 1. 做了什么、没做什么

做了什么：

- 同一内容页 `App` 分别走 CSR（Vite 入口 `createRoot`）与 `renderToString`。
- 构建产物检查：`index.html` 引用 hashed JS、asset 存在、总字节数、SHA-256。
- 静态缓存：HTML `no-cache`、asset `immutable` + ETag；条件请求 304。
- 泄漏检查：传入非 `VITE_` 的 `E05_SECRET`，构建产物不得包含。
- 2 条组件/SSR 测试 + tsc + build。
- 渲染实验：父组件更新与 memo bailout、key 用 ID/用 index 的状态迁移、key 变化导致重挂。
- memo 边界：内联对象/函数让 memo 失效、`useMemo`/`useCallback` 修复、Context 穿透 memo。
- React Profiler：记录 mount/update 的提交次数、`actualDuration`、`baseDuration`、commit 时间；"原因"由实验侧埋点记录（React 不暴露 render cause）。
- bundle 对照：同一面板静态引入 vs `React.lazy`，同口径（esbuild minify + sourcemap）比较入口 raw/gzip、chunk 数、tree-shaking 标记、gzip 预算。

没做什么：

- 没有 hydration/注水一致性测试；SSR HTML 只验证首屏字符串（E03 覆盖 hydration）。
- 没有真实 CDN/反向代理/共享缓存；缓存检查是本地静态服务。
- 没有 LCP/INP 等运行时性能数字；bundle 只测构建产物体积，不等于加载性能。
- 没有路由级懒加载与旧 HTML 引用已删除 chunk 的故障演练。
- 没有集成到项目 01。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | CSR 构建的 `index.html` 只有空 root，内容靠 JS | 读 `dist/index.html` | **成立**：HTML 只有 `<div id="root">` 与 script，无列表内容 |
| H2 | `renderToString` 首屏 HTML 含标题与列表，不依赖客户端 JS | 渲染并检查字符串 | **成立**：`<h1>E05 构建与渲染</h1>`、列表文本存在 |
| H3 | 构建引用 hashed asset，且 asset 存在 | 解析 index + 文件检查 | **成立**：`assets/index-DEFdGYln.js` 存在 |
| H4 | 非 `VITE_` 环境变量不会进入前端产物 | 构建时设置 `E05_SECRET`，扫描 dist | **成立**：`secret_leak=false` |
| H5 | HTML 不缓存、hashed asset 长缓存，条件请求 304 | 本地静态服务 + fetch | **成立**：`no-cache` / `immutable` / 304 |

## 3. 干净环境

```text
OS        : Windows 10.0.28000 x64
Node      : v24.15.0
React     : 19.3.1
Vite      : 8.3.6
Vitest    : 5.1.0
tsx       : 4.23.15（运行 SSR TSX 脚本）
锁文件    : package-lock.json（npm ci 可复现）
```

## 4. 输入与装置

- 同一 `App` 组件：标题 + 3 条列表。
- CSR：`src/main.tsx` → `createRoot`。
- SSR：`scripts/render.tsx` → `renderToString`，写入 `evidence/ssr.html`。
- 构建：`vite build` 输出到 `dist/`（不入 Git）。
- 缓存：`scripts/serve-check.mjs` 用 Node http 服务 `dist/`，检查头与 304。

## 5. 执行命令

```bash
cd 06-实验代码/E05-build-render
npm ci
npm test                     # 10 条：CSR/SSR + reconciliation + memo + Profiler
bash scripts/run_unit.sh     # 类型检查、测试、构建、SSR、bundle 对照、缓存
```

单独：

```bash
npx tsc --noEmit
npx vitest run
E05_SECRET=do-not-ship-this-secret npx vite build
npx tsx scripts/render.tsx
node scripts/inspect-build.mjs
node scripts/bundle-compare.mjs
node scripts/serve-check.mjs
```

## 6. 结果

| 验收项 | 预期 | 实际 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| CSR 组件 | 标题 + 3 列表项 | 符合 | 通过 | `tests/app.test.tsx` |
| SSR 首屏 | HTML 含标题/列表 | `SSR PASS bytes=343` | 通过 | `evidence/ssr.html`、`ssr-run.txt` |
| 构建产物 | hashed asset 存在 | `assets/index-DEFdGYln.js`，总 220,207 bytes | 通过 | `evidence/build-manifest.json` |
| 秘密泄漏 | 非 VITE_ 变量不出现 | `secret_leak=false` | 通过 | `evidence/inspect.txt` |
| 缓存头 | HTML no-cache；asset immutable | 符合 | 通过 | `evidence/cache.txt` |
| 条件请求 | 304 | 304 | 通过 | `evidence/cache.txt` |
| 类型检查 | 0 error | 0 error | 通过 | `evidence/typecheck.txt` |
| reconciliation | memo 子组件在同 props 下不重渲染；key 决定状态归属 | 符合 | 通过 | `tests/render.test.tsx` |
| memo 边界 | 内联对象/函数失效；`useMemo`/`useCallback` 修复；Context 穿透 | 符合 | 通过 | `tests/render.test.tsx` |
| Profiler | mount/update 两次提交，含时长与埋点原因 | 符合 | 通过 | `tests/render.test.tsx` |
| bundle 对照 | 动态导入拆 chunk、入口不增大、预算通过 | entry 224531B→223602B，gzip 70203B→70074B，chunks 1→2 | 通过 | `evidence/bundle-compare.txt`、`bundle-manifest.json` |

`evidence/run.txt` 汇总：`Test Files 1 passed`、`Tests 2 passed`、`SSR PASS`、`INSPECT PASS`、`CACHE PASS`、`gate_failures: 0`。

## 7. 关键结论

- CSR 的 `index.html` 是空壳；首屏内容依赖 JS 下载/执行。SSR 的首屏 HTML 自带内容，但**没有 hydration 仍不可交互**。
- hashed asset 可以长缓存（immutable）；HTML 不能长缓存，否则用户会拿到旧 asset 引用。ETag/304 是验证器，不是“永久缓存”。
