# 场景 03：重复请求与同 key 不同 body

## 触发条件

网关重试、客户端超时重发都会让同一业务请求到达两次。用 `Idempotency-Key` 作为主键，body 哈希作为内容指纹。

## 观察到的现象

| 请求 | body | 结果 |
| --- | --- | --- |
| 第 1 次 | `{"amount":10}` | `created`，handler 执行 1 次 |
| 第 2 次 | `{"amount":10}` | `duplicate`，返回第 1 次保存的响应，handler 不再执行 |
| 第 3 次 | `{"amount":99}` | `conflict`，同 key 不同内容被拒绝 |

## 判读

- `evidence/redlock.txt` 必须出现 `handler calls=1` 与 `same key different body: conflict`。
- 若重复请求返回 `created`，说明幂等键没有唯一约束；若不同 body 返回 `duplicate`，说明只比对了 key、没比对内容。

## 边界

响应缓存只存在 PostgreSQL；没有 TTL 清理、并发同 key 的隔离级别细节与多租户命名空间。
