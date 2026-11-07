# E05：构建产物、SSR 对照与静态缓存

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E05。
> 本实验只覆盖“构建产物 + CSR/SSR 首屏 + 静态缓存”这一子集，不覆盖 hydration/路由懒加载/真实 CDN/性能测量，也**不代表 G3 或 G6 通过**。
> 环境：Windows 10.0.28000 + Node v24.15.0 + React 19.3.1 + Vite 8.3.6 + Vitest 5.1.0

## 1. 做了什么、没做什么

做了什么：

- 同一内容页 `App` 分别走 CSR（Vite 入口 `createRoot`）与 `renderToString`。
- 构建产物检查：`index.html` 引用 hashed JS、asset 存在、总字节数、SHA-256。
- 静态缓存：HTML `no-cache`、asset `immutable` + ETag；条件请求 304。
- 泄漏检查：传入非 `VITE_` 的 `E05_SECRET`，构建产物不得包含。
- 2 条组件/SSR 测试 + tsc + build。

没做什么：

- 没有 hydration/注水一致性测试；SSR HTML 只验证首屏字符串。
- 没有路由懒加载、tree-shaking 对比、source map 分析。
- 没有真实 CDN/反向代理/共享缓存；缓存检查是本地静态服务。
- 没有首屏性能/LCP/包体优化的量化结论。
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
bash scripts/run_unit.sh
```

单独：

```bash
npx tsc --noEmit
npx vitest run
E05_SECRET=do-not-ship-this-secret npx vite build
npx tsx scripts/render.tsx
node scripts/inspect-build.mjs
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

`evidence/run.txt` 汇总：`Test Files 1 passed`、`Tests 2 passed`、`SSR PASS`、`INSPECT PASS`、`CACHE PASS`、`gate_failures: 0`。

## 7. 关键结论

- CSR 的 `index.html` 是空壳；首屏内容依赖 JS 下载/执行。SSR 的首屏 HTML 自带内容，但**没有 hydration 仍不可交互**。
- hashed asset 可以长缓存（immutable）；HTML 不能长缓存，否则用户会拿到旧 asset 引用。ETag/304 是验证器，不是“永久缓存”。
- 只有 `VITE_` 前缀变量会被 Vite 注入前端；但这不代表可以放秘密——构建日志、source map、错误上报仍可能泄漏。秘密应留在服务端。
- 构建成功不等于性能好；本实验没有测 LCP/INP，也没有比较 tree-shaking 前后体积。

## 8. 边界：这套装置没有证明什么

1. **没有 hydration**：SSR 字符串没有在客户端注水；事件/状态未验证。
2. **没有路由/动态导入**：没有 chunk 拆分、旧 HTML 引用已删除 chunk 的故障。
3. **没有真实 CDN/代理**：缓存头是本地服务行为；共享缓存/Vary/个性化未测。
4. **没有性能数字**：不写 LCP/INP/包体优化结论。
5. **没有秘密全链路审计**：只验证一个非 VITE_ 变量未进产物。
6. **没有接项目 01**；G3/G6 仍要求完整博客/部署与可访问性证据。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M05 前端工程 | 部分 | 构建产物、hashed asset、CSR/SSR 首屏、缓存头 |
| E05 | **本实验** | 只覆盖构建/渲染/缓存子集 |
| G3 | 仅构建子项 | 无完整博客/可访问性/非教程变更 |
| G6 | 不覆盖 | 无部署/灰度/回滚 |

结论：**E05 完成 ≠ G3/G6 通过**。

## 10. 目录结构

```text
E05-build-render/
├── src/App.tsx / main.tsx / vite-env.d.ts
├── tests/app.test.tsx / setup.ts
├── scripts/
│   ├── render.tsx          renderToString → evidence/ssr.html
│   ├── inspect-build.mjs   hashed asset/体积/secret 检查
│   ├── serve-check.mjs     no-cache/immutable/304
│   └── run_unit.sh
├── evidence/               构建清单、SSR、缓存、原始输出
└── package.json / package-lock.json
```