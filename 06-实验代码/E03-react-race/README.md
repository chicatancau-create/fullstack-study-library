# E03：React 筛选竞态、取消与乐观回滚

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E03。
> 本实验只覆盖 G3 中“前端请求竞态/状态归属”这一项，不覆盖构建/SSR/可访问性，也**不代表 G3 通过**。
> 环境：Windows 10.0.28000 + Node v24.15.0 + React 19.3.1 + Vite 8.3.6 + Vitest 5.1.0

## 1. 做了什么、没做什么

做了什么：

- 写了一个**反例** `BadList`：Effect 没有 cleanup/版本校验；先切到 B、先让 B 返回、再让 A 迟到，A 会覆盖 B。
- 写了修复版 `GoodList`：`AbortController` + `cancelled` 版本校验；同一 deferred 顺序下 B 保持。
- 写了 `OptimisticList`：先显示临时项，保存失败回滚并显示 `role="alert"`；成功用服务端结果替换。
- 卸载测试：卸载后 resolve 旧请求，`signal.aborted === true`，无 `console.error`/act 警告。
- 用 Vitest + Testing Library 做确定性顺序测试；`tsc --noEmit` 与 `vite build` 通过。

没做什么：

- 没有 E2E/真实浏览器交互；没有 React Profiler 长任务测量。
- 没有路由卸载（用组件 unmount 代替），没有 SSR/SSG。
- 没有真实网络/后端；“下游”是 deferred 测试替身。
- 没有乐观更新的并发冲突/服务端版本号；只覆盖单次保存失败回滚。
- 没有把 E03 接进项目 01。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 没有 cleanup 的 Effect，旧请求晚到会覆盖新筛选结果 | BadList：A 先挂起→切 B→B 先返回→A 迟到 | **成立**：列表显示 `A-late`，`B-item` 消失 |
| H2 | `AbortController` + `cancelled` 能阻止旧响应写入 | GoodList 同一顺序 | **成立**：`B-item` 保持，`A-late` 不出现 |
| H3 | 乐观更新在保存失败时必须回滚临时项 | 保存 deferred 先显示、再 reject | **成立**：临时项移除，`role=alert` 显示错误 |
| H4 | 卸载后旧请求不得再 setState | unmount 后 resolve，检查 signal 与 console | **成立**：`aborted=true`，无 console.error |
| H5 | 保存成功时临时项被服务端结果替换 | 保存 deferred resolve 正式 id | **成立**：列表保留且无 alert |

## 3. 干净环境

```text
OS        : Windows 10.0.28000 x64
Node      : v24.15.0
React     : 19.3.1
Vite      : 8.3.6
Vitest    : 5.1.0
Testing Library : @testing-library/react 16.3.3
依赖锁    : package-lock.json（npm ci 可复现）
```

## 4. 输入与装置

- 输入：`Loader(filter, signal) -> Promise<Item[]>`；测试用 deferred 精确控制 resolve 顺序。
- 反例/修复对照：同一组 A/B 请求顺序，只换组件。
- 乐观保存：`Saver(title) -> Promise<Item>`；测试控制成功/失败。
- 卸载：先 render，再 unmount，最后 resolve 旧 promise。

## 5. 执行命令

```bash
cd 06-实验代码/E03-react-race
npm ci
bash scripts/run_unit.sh
```

单独跑：

```bash
npx tsc --noEmit
npx vitest run
npx vite build
```

`run_unit.sh` 任一必需步骤失败即非零。

## 6. 结果

| 验收项 | 预期 | 实际 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| 反例复现 | A 迟到覆盖 B | `A-late` 出现、`B-item` 消失 | 通过（缺陷复现） | `tests/race.test.tsx` 第 1 条 |
| 修复回归 | B 保持、A-late 不出现 | 符合 | 通过 | `tests/race.test.tsx` 第 2 条 |
| 乐观成功 | 临时项被正式项替换 | 符合 | 通过 | `tests/optimistic.test.tsx` |
| 乐观失败回滚 | 临时项移除 + alert | 符合 | 通过 | `tests/optimistic.test.tsx` |
| 卸载 | abort + 无 setState 警告 | `aborted=true`、无 console.error | 通过 | `tests/unmount.test.tsx` |
| 类型检查 | 0 error | 0 error | 通过 | `evidence/typecheck.txt` |
| 生产构建 | 成功 | `vite build` 成功 | 通过 | `evidence/build.txt` |

合计 **5/5** 测试通过；`evidence/run.txt` 记录 `Test Files 3 passed`、`Tests 5 passed`。

## 7. 关键代码

反例（`src/BadList.tsx`）：

```tsx
useEffect(() => {
  setLoading(true);
  load(filter).then((data) => { setItems(data); setLoading(false); });
}, [filter, load]);
```

修复（`src/GoodList.tsx`）：

```tsx
useEffect(() => {
  const controller = new AbortController();
  let cancelled = false;
  load(filter, controller.signal).then(
    (data) => { if (!cancelled) { setItems(data); setLoading(false); } },
    (error) => { if (!cancelled) { setError(...); setLoading(false); } },
  );
  return () => { cancelled = true; controller.abort(); };
}, [filter, load]);
```

**abort 是尽力而为，`cancelled` 才是最后防线**；只写 abort 而底层不响应时，旧回调仍可能到达。

## 8. 边界：这套装置没有证明什么

1. 没有真实浏览器/网络/E2E；测试替身不覆盖 DNS/连接/超时。
2. 没有 Profiler/长任务/渲染次数测量；不宣称性能优化。
3. 没有路由层卸载、Suspense、Server Components、hydration。
4. 没有服务端版本号/并发冲突；乐观更新只覆盖单次失败回滚。
5. 没有把组件接进项目 01；G3 仍要求完整博客与非教程前端变更。
6. 组件测试通过不等于可访问性/视觉通过；U02/G1 站点另行验证。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M03 Web 体验 | 部分 | 状态可访问、错误提示；无完整页面 |
| M05 前端工程 | 部分 | Vite 构建、组件测试；无 SSR/缓存 |
| M09 测试与调试 | 部分 | 确定性竞态/回滚/卸载测试；无 E2E |
| E03 | **本实验** | 只覆盖竞态/回滚/卸载 |
| G3 | 仅竞态子项 | 不代表 G3 通过 |

结论：**E03 完成 ≠ G3 通过**；G3 还需要可运行博客、构建/缓存报告与非教程前端变更。

## 10. 目录结构

```text
E03-react-race/
├── src/
│   ├── BadList.tsx        反例：无 cleanup
│   ├── GoodList.tsx       修复：abort + cancelled
│   ├── OptimisticList.tsx 乐观更新与回滚
│   ├── types.ts
│   └── main.tsx           Vite 入口（仅演示 GoodList）
├── tests/
│   ├── race.test.tsx
│   ├── optimistic.test.tsx
│   ├── unmount.test.tsx
│   ├── helpers.ts
│   └── setup.ts
├── scripts/run_unit.sh
├── evidence/              原始输出与 manifest
└── package.json / package-lock.json
```