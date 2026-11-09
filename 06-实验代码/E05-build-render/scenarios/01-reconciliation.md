# 反例 01：用 index 当 key，重排后状态错位

## 症状

列表重排（拖拽、排序、插入置顶）后，输入框、展开状态、选中项跟着位置走，而不是跟着数据走；用户看到"内容还是那几条，但填的字跑到了别的行"。

## 反例

```tsx
items.map((label, i) => <Row key={i} label={label} />)
```

React 用 key 判断"这是不是同一个组件实例"。`key=0` 在重排前后都指向第一个位置，所以 React 复用了第一个实例的状态，只把 label 换成新数据。

## 实测（`tests/render.test.tsx`）

| 写法 | 操作 | 结果 |
| --- | --- | --- |
| `key={label}` | 在 A 输入 `x`，列表变为 `[B, A]` | A 的输入框仍是 `x`（状态跟数据走） |
| `key={i}` | 同上 | A 输入框变空，`x` 留在位置 0（现在是 B） |

## 另一个反例：以为"改 props 就会重置状态"

`<Remount nonce={1} />` 改成 `nonce={2}` 只更新 props，组件状态保留；只有 **key 变化** 才会卸载重挂、状态清空。实验中断言了这两种行为。

## 修复

1. 稳定业务 ID 作为 key；没有 ID 时，在数据进入列表前生成一次稳定的临时 ID，而不是每次渲染 `Math.random()`。
2. 真的需要"换数据即重置"时，显式改 key（如 `key={`${userId}-${formVersion}`}`），并在注释里写明这是有意的重置。
3. 不要把 key 用在非列表位置来"强制刷新"整棵树——页面级刷新用状态或路由，别用 key 当后门。

## 与 memo 的关系

父组件重渲染时，React 会先比较子元素类型与 key：类型相同、key 相同就复用实例；再比较 props 决定是否调用 render。`memo` 只影响第二层判断，**不能修复错误的 key**。

## 自检

```bash
cd 06-实验代码/E05-build-render
npx vitest run tests/render.test.tsx
```
