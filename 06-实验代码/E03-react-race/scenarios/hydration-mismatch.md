# 反例：SSR 与客户端首帧数据不一致

## 场景

服务端 HTML 使用渲染时刻的时间与随机请求 ID；客户端 hydration 时重新执行组件，得到新的时间与随机 ID。

## 复现

```tsx
// 反例：两端各自取值
<Clock snapshot={{ now: Date.now(), requestId: Math.random().toString(36) }} />
```

`tests/hydration.test.tsx` 先用 `renderToString` 生成 `request-id=server`，再 `hydrateRoot(container, <BadHydration />)`：

- hydration 后 `[data-testid=request-id]` 不再是 `server`；
- `time[datetime]` 与服务端渲染值不同；
- React 19 开发模式同时报告可恢复 hydration 错误。

## 修复

```tsx
const snapshot = serverSnapshot(1_700_000_000_000, 'fixed-id');
renderToString(<Clock snapshot={snapshot} />);
// 客户端从序列化状态读取同一 snapshot
hydrateRoot(container, <GoodHydration snapshot={snapshot} />);
```

断言：hydration 无 error，`request-id=fixed-id`，`datetime` 与服务端一致。

## 期望 vs 实际

| 版本 | 期望 | 实际 |
| --- | --- | --- |
| 两端各自取时间/随机数 | DOM 与 SSR 一致 | DOM 被替换，出现 hydration 错误 |
| 服务端快照注入 | 无错误、DOM 一致 | 断言通过 |

## 边界

本实验验证的是 hydration 首帧一致性，不覆盖流式 SSR、选择性 hydration 或第三方脚本提前改 DOM。
