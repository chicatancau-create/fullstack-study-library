# 反例 02：memo 失效的三种典型原因

## 症状

加了 `React.memo`，Profiler 里子组件仍然每次父组件更新都重渲染；或者反过来，以为 memo 能挡住 Context 更新，结果整块 UI 跟着刷新。

## 原因一：内联对象/数组作为 props

```tsx
<ObjectChild options={{ mode: 'stable' }} />
```

每次父组件 render 都创建新对象，浅比较永远不相等，memo 直接失效。

实测：父组件点 "rerender" 后，`object` 渲染计数 1 → 2。

修复：`useMemo(() => ({ mode: 'stable' }), [])`，或把对象拆成原始值 props。实测修复后计数保持 1。

## 原因二：内联函数作为 props

```tsx
<CallbackChild onPick={() => {}} />
```

同理，函数引用每次都是新的。修复：`useCallback`。实测修复后计数保持 1。

## 原因三：Context 穿透 memo

```tsx
const ContextChild = memo(function ContextChild() {
  const theme = useContext(ThemeContext);
  ...
});
```

memo 只比较 props；Context 的订阅在组件内部，Provider 的 value 变化会让消费者重渲染，memo 挡不住。

实测：切换 theme 后 `context` 计数 1 → 2，而 `object`/`callback` 保持 1。

## 另外两种常见误判

- `memo` 比较的是 props，不是"父组件是否渲染"。父组件重渲染但 props 引用不变时，memo 子组件不重渲染（这正是 bailout）。
- 用 `useCallback` 包了函数，但依赖数组写错（漏依赖或每次变化），引用仍然不稳定；依赖数组要按实际读取的值写，而不是为了"稳定"写空数组。

## 修复清单

1. 先看 Profiler：确认是谁在渲染、渲染了几次。
2. 对象/数组用 `useMemo`；函数用 `useCallback`；依赖写全。
3. 大组件树按 Context 拆小：高频变化的 Context 只包真正需要它的叶子，别把整棵树包进去。
4. 不要给所有组件无脑套 memo：比较 props 也有成本，纯展示且 props 简单的组件收益接近 0。

## 自检

```bash
cd 06-实验代码/E05-build-render
npx vitest run tests/render.test.tsx
grep -n 'memo 边界' README.md
```
