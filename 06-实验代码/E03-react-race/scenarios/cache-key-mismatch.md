# 反例：缓存键失配与陈旧缓存

## 场景

同一筛选条件 `filter=a`，在中文与英文界面下返回不同文案；缓存只用 `filter` 做 key。

## 复现

```ts
const zh = badCacheKey({ filter: 'a', locale: 'zh-CN' }); // 'a'
const en = badCacheKey({ filter: 'a', locale: 'en-US' }); // 'a'
cache.set(zh, ['A-中文']);
cache.get<string[]>(en); // ['A-中文'] —— 错误命中
```

对照修复：`cacheKey({ filter, locale, schemaVersion })` 生成 `a|en-US|v1`，locale 或版本变化必然换 key。

## 失效与 SWR

- `invalidate('a')` 只清 `a|*` 前缀，不影响 `b|*`。
- `readWithSWR`：无缓存走网络；新鲜直接返回；超过 `maxAge` 先返回旧值，同时后台刷新并写回。

## 期望 vs 实际

| 版本 | 期望 | 实际 |
| --- | --- | --- |
| 只用 filter | 英文界面不得出现中文缓存 | 出现中文 |
| key 含 locale/version | 英文界面重新取数 | 缓存未命中，网络取数 |
| SWR 过期 | 首屏旧值、后台更新 | `source=stale`，`refresh` 后值更新 |

## 边界

只证明单进程内存缓存的键与失效行为；不证明跨标签页同步、HTTP 缓存头或服务端缓存一致性。
