# 反例：路由快速切换时旧响应覆盖新响应

## 场景

1. 初始在路由 A，点击“路由 B”。
2. 在 B 尚未返回时，快速切回 A（或先 A 后 B）。
3. 慢请求后到，把当前路由的数据覆盖成旧路由的数据。

## 复现

- `src/main.tsx` 挂载 `RouteRace`。
- `e2e/race.spec.ts` 用 Playwright 拦截 `/api/items?filter=a` 延迟 800ms、`filter=b` 延迟 50ms。
- 先点 A，100ms 后点 B；B 先返回并渲染。

## 期望 vs 实际

| 版本 | 期望 | 实际 |
| --- | --- | --- |
| 无 cleanup（BadList 同类写法） | 只显示 B | A 晚到后覆盖，显示 A |
| AbortController + 当前信号校验（GoodList / RouteRace） | 只显示 B | 显示 B，事件里只有 `apply:b` |

## 修复

- 每次切换先 `controller.abort()` 中止上一个请求。
- 响应写入前检查 `current.signal.aborted`，被中止则不 setState。
- 路由切换与请求一一绑定，不共享可被覆盖的模块级变量。

## 边界

- 本场景只证明“客户端取消 + 版本校验”能阻止迟到写入；不证明服务端幂等、缓存一致性或离线重放。
