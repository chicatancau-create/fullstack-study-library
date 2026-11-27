- 只有 `VITE_` 前缀变量会被 Vite 注入前端；但这不代表可以放秘密——构建日志、source map、错误上报仍可能泄漏。秘密应留在服务端。
- 构建成功不等于性能好；本实验有构建产物体积对照，但没有测 LCP/INP。
- reconciliation：**key 决定"这个位置上的组件实例是谁"**。用 index 当 key，重排后状态留在位置而不是数据上；用 ID 当 key，状态跟着数据迁移。改 props 不重置状态，改 key 才卸载重挂。
- memo 只比较 props：内联对象/函数每次都是新引用，memo 失效；固定引用要靠 `useMemo`/`useCallback`。Context 变化绕不过 memo，因为订阅在组件内部。
- Profiler 能给出提交次数、`phase`、`actualDuration`、`baseDuration` 与 `commitTime`；**但 React 不暴露"为什么渲染"**，本实验的 reason 是测试侧埋点，不要把它当作官方 API。
- bundle：动态导入把页面代码移出入口、拆出独立 chunk，入口 hash 与页面 hash 解耦；本例入口只省 0.4%，因为面板本身只有 2.6KB，React 本体仍在入口。预算（入口 gzip ≤ 150KB）是比"省了多少"更可靠的守门指标。
- `import()` 不保证总字节下降（本例 +1.8KB raw 的 chunk 包装）；它优化的是首屏加载量与缓存粒度。

## 8. 边界：这套装置没有证明什么

1. **没有 hydration**：SSR 字符串没有在客户端注水；事件/状态未验证（见 E03）。
2. **没有路由级懒加载**：只对照了组件级 `lazy`；没有旧 HTML 引用已删除 chunk 的故障演练。
3. **没有真实 CDN/代理**：缓存头是本地服务行为；共享缓存/Vary/个性化未测。
4. **没有运行时性能数字**：不写 LCP/INP；bundle 字节不等于加载耗时。
5. **没有秘密全链路审计**：只验证一个非 VITE_ 变量未进产物。
6. **Profiler 的"原因"不是 React 官方能力**：实验用埋点标注触发源；并发特性下的选择性注水/时间切片未测。
7. **没有接项目 01**；G3/G6 仍要求完整博客/部署与可访问性证据。

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
├── index.html              入口：App + React.lazy(LabPanel)
├── index.baseline.html     对照入口：AppLab（静态引入）
├── src/
│   ├── App.tsx / AppLab.tsx / main.tsx / main.baseline.tsx
│   ├── lab/
│   │   ├── counters.ts     渲染计数（实验观测）
│   │   ├── Reconcile.tsx   父更新 / memo bailout / key 迁移 / 重挂
│   │   ├── Memo.tsx        内联 props、useMemo/useCallback、Context 穿透
│   │   ├── Profiler.tsx    Profiler 记录提交与埋点原因
│   │   └── LabPanel.tsx    懒加载面板
│   └── lib/optimize.ts     usedSum + 刻意留下标记的未使用导出
├── tests/app.test.tsx / render.test.tsx / setup.ts
├── scripts/
│   ├── render.tsx          renderToString → evidence/ssr.html
│   ├── inspect-build.mjs   hashed asset/体积/secret 检查
│   ├── bundle-compare.mjs  两套构建 + raw/gzip/chunk/tree-shaking/sourcemap/预算
│   ├── serve-check.mjs     no-cache/immutable/304
│   └── run_unit.sh
├── scenarios/              01-reconciliation / 02-memo-边界 / 03-bundle-优化
├── evidence/               构建清单、SSR、缓存、bundle 对照、原始输出
└── package.json / package-lock.json
```

`evidence/bundle-compare.txt` 是 bundle 对照的文本报告，`evidence/bundle-manifest.json` 记录两套产物每个文件的字节、gzip 与 SHA-256；两者都由 `scripts/bundle-compare.mjs` 生成，不手改。