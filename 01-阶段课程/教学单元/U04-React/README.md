# U04：React 状态、Effect 与筛选竞态

> 前置：完成 U02、U03；知道 Promise 与事件循环。
>
> 本单元用 React 19 + Vite 8 + Vitest 5 做一个最小筛选列表，重点不是“会写组件”，而是**旧请求晚到不能覆盖新状态**。它是教学示例，不替代 E03 实验。

## 1. 目标 / 非目标 / 产出

**目标**

- 解释 render/commit、状态快照、派生状态与 Effect 的职责边界。
- 用 Effect 依赖与 cleanup 处理筛选切换、取消与迟到响应。
- 区分 loading / empty / error / ready 四类状态，给出可访问反馈。
- 用 Testing Library 测用户可见行为；用 deferred 控制响应顺序，确定性复现竞态。
- 跑通 `tsc --noEmit`、`vitest run`、`vite build`。

**非目标**

- 不做 SSR/RSC、路由、全局状态库、复杂表单。
- 不把 E03 的完整实验（乐观回滚、卸载、Profiler）搬到这里；E03 仍是独立实验。
- 不宣称“测试绿 = G3 通过”。

**产出**

- 运行 `src/RecordApp.tsx` 的 4 条组件测试与生产构建。
- 完成练习、自测与 [盲测](blind/README.md)；答案在 [answers](answers/README.md)。

## 2. 心智模型

React 的 render 必须是纯的：同样 props/state 得到同样 UI。状态是快照，事件处理里读到的是**本次 render 的闭包值**；异步回调晚到时，闭包可能已经过期。Effect 在 commit 之后运行，cleanup 在下一次 effect 前或卸载时运行。

竞态的本质不是“网络慢”，而是“旧请求的结果晚到”。修复有两条路：取消（`AbortController`）与版本校验（`cancelled`/requestId）。**只 abort 不够**：底层未必立刻停止，回调仍可能到达；所以 cleanup 里还要设置 `cancelled = true`，在 then/catch 里先检查。

派生状态能从现有 state/props 算出，就不要另存一份；否则两份状态会漂移。loading/empty/error 是 UI 状态，不是“有没有数据”的副作用。

## 3. 讲义

### 3.1 状态与派生

```tsx
const [filter, setFilter] = useState<Filter>('all');
const visible = records.filter((r) => filter === 'all' || r.status === filter);
```

如果 `visible` 只由 `records` 与 `filter` 决定，就不要 `useState(visible)`；直接算。这样不会出现“records 更新了但 visible 没更新”。

### 3.2 Effect、依赖与清理

```tsx
useEffect(() => {
  const controller = new AbortController();
  let cancelled = false;
  loadRecords(filter, controller.signal).then(
    (data) => { if (!cancelled) setRecords(data); },
    (error) => { if (!cancelled) setError(String(error)); },
  );
  return () => { cancelled = true; controller.abort(); };
}, [filter, reload, loadRecords]);
```

- `filter` 变化会重新请求；cleanup 先把旧请求标记为取消。
- `loadRecords` 必须是稳定引用（模块级函数或 `useCallback`），否则每次 render 都重跑。
- `cancelled` 是数据到达时的“版本校验”，`abort` 是尽量让底层停止；两者一起用。

### 3.3 可访问状态

```tsx
{state === 'loading' && <p role="status">加载中…</p>}
{state === 'error' && <div role="alert">…<button>重试</button></div>}
<button aria-pressed={filter === item.value}>…</button>
```

用 `role="status"`/`role="alert"` 让辅助技术感知变化；筛选按钮用 `aria-pressed`，不要只靠背景色。

### 3.4 测试竞态

```tsx
const first = deferred<Record[]>();
const second = deferred<Record[]>();
// 点击 A -> first；点击 B -> second；先 resolve second，再 resolve first
```

Testing Library 只断言用户看得到的文本/角色，不直接读组件内部 state。`await waitFor` 处理异步更新；`cleanup` 防止测试间泄漏。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U04-React
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状）：

```text
typecheck exit=0
test exit=0
build exit=0
typecheck: 0 errors
test: Test Files 1 passed (1) Tests 4 passed (4)
build: ✓ built in ...ms
gate_failures: 0
```

实际输出见 `evidence/typecheck.txt`、`test.txt`、`build.txt`、`run.txt`。生产构建产物在 `dist/`（不入 Git）。

## 5. 常见错误

### 错误 1：Effect 没有 cleanup

- 现象：快速切筛选，旧请求晚到把新列表覆盖。
- 定位：在 then 里打印当前 filter；看 cleanup 是否存在。
- 修复：`cancelled` + `AbortController.abort()`；then/catch 先检查。
- 回归：deferred 测试先 resolve 新请求、再 resolve 旧请求，旧结果不得出现。

### 错误 2：漏依赖/依赖不稳定

- 现象：filter 变了不请求，或每次 render 都请求。
- 定位：React DevTools/日志；检查 `loadRecords` 是否每次新建。
- 修复：补依赖；把 loader 放模块级或用 `useCallback`。
- 回归：切换筛选只发一次请求。

### 错误 3：把派生状态又存一份

- 现象：records 更新后列表不更新，或两份状态不一致。
- 定位：搜 `useState` 里由 props/state 计算的值。
- 修复：直接计算；需要缓存时用 `useMemo`，不是 state。
- 回归：records/filter 变化后 UI 同步。

### 错误 4：只测实现不测行为

- 现象：测试断言内部 state/函数被调用，重构就红，用户问题却没覆盖。
- 定位：测试是否用 `getByRole/getByText`。
- 修复：断言 loading/empty/error/列表内容与 aria 状态。
- 回归：把竞态修复删掉，测试必须红。

### 错误 5：用颜色表达筛选选中

- 现象：色觉差异用户不知道当前筛选。
- 定位：按钮是否有 `aria-pressed`；去掉颜色是否还能判断。
- 修复：`aria-pressed` + 文本/边框；不要只改 class。
- 回归：读 `aria-pressed` 断言。

## 6. 练习

### 基础

1. 增加“按分钟排序”按钮，排序是派生值还是 state？说明理由。
2. 给列表加空状态与错误重试，各写一条测试。
3. 把筛选按钮改成 `<a>` 路由会怎样？需要哪些语义与键盘行为？

### 边界

4. 连续快速切换 5 次筛选，只有最后一次结果可见；写确定性测试。
5. loader 抛 `AbortError` 时不要显示错误；写测试区分“主动取消”和“真实失败”。
6. 用 `aria-live`/`role=status` 检查 loading 与空状态的可感知性。

## 7. 自测

1. render/commit 与 Effect 的执行时机？
2. 为什么“旧请求晚到”不是网络问题，而是状态归属问题？
3. 只 abort 不检查 `cancelled` 会怎样？
4. 哪些状态应该派生、哪些应该存 state？
5. Testing Library 为什么优先按 role/text 查询？

答案见 [answers/README.md](answers/README.md)。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。要求独立实现带搜索、取消、错误/空状态的列表；不附答案。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M03 Web 体验 | 部分 | 可访问状态与键盘按钮；无完整站点 |
| M05 前端工程 | 部分 | Vite 构建、组件测试；无 SSR/缓存 |
| M09 测试与调试 | 部分 | 确定性竞态测试；无 E2E |
| E03 | 参考 | 只做筛选竞态的最小教学版；E03 的完整实验未完成 |
| G3 | 不覆盖 | 没有完整博客或非教程前端变更，不代表 G3 |

## 10. 官方资料与查阅日期

- [React 文档](https://react.dev/learn)：2026-11-07 查阅；React 19.3.1。
- [Vite 指南](https://vite.dev/guide/)：2026-11-07 查阅；Vite 8.3.6。
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)：2026-11-07 查阅。
- [Vitest](https://vitest.dev/)：2026-11-07 查阅；Vitest 5.1.0。
- 版本边界：React 19 的 Effect 语义与并发特性以官方文档为准；本单元未覆盖 RSC/Compiler。

## 11. 证据

- `evidence/typecheck.txt`、`test.txt`、`build.txt`、`run.txt`
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256