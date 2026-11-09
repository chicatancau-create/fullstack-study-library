# E09：Redis 分布式锁、fencing 与幂等

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E09。
> 本实验在**真实 Redis 8.10.3 三实例**上做 Redlock + fencing token + 幂等，并保留 Cache Aside 作为对照；不覆盖 Sentinel/Cluster 与网络分区。
> 环境：Windows 10.0.28000 + Node v24.15.0 + Redis 8.10.3（redis-windows msys2 构建，127.0.0.1:7001-7003）+ PostgreSQL 18.6

## 1. 做了什么、没做什么

做了什么：

- 用 `src/cluster.mjs` 启动 **3 个独立 Redis 实例**（7001/7002/7003，无主从、无集群），`src/redlock.mjs` 实现带 owner token 的获取/释放、quorum=2、TTL 与续租。
- 锁竞争：同 key 只有一个 owner，3 个实例持有同一 token，第二个客户端获取失败。
- 误删他人锁：释放脚本比对 token，错误 owner 删除 0 个 key。
- quorum 丢失：可用实例少于 2/3 时获取失败；2/2 时成功。
- 锁过期反例：TTL 300ms + 进程暂停 450ms，新 owner 接管；旧 owner 晚到写覆盖新值（无 fencing）。
- fencing：PostgreSQL 保存单调 token，`UPDATE ... WHERE fencing < $new` 拒绝 stale writer。
- 幂等：`Idempotency-Key` 主键 + body 哈希；重复请求复用响应，同 key 不同 body 返回 conflict。
- Cache Aside 保留：旧读晚写回、版本化 key、Redis 不可用降级，5 条回归测试仍在。
- `tests/redlock.test.js` 6 条 + `tests/cache.test.js` 5 条，全部真实服务。

没做什么：

- 三个实例同机、同一构建；没有跨机房、网络分区、时钟漂移与 Redis Sentinel/Cluster。
- “进程暂停”用 `setTimeout` 模拟，不是真实 STW；没有测 GC 停顿分布。
- quorum 丢失用未监听端口模拟，不是杀进程；没有测多数派恢复后的 token 冲突。
- fencing 只在单表单行验证；没有覆盖多写者、事务隔离级别与 schema 迁移。
- 幂等表没有 TTL 清理、并发同 key 的锁、跨租户命名空间。
- Cache Aside 仍跑在 6379 的 Redis 3.0.504 上，仅作对照，不是 Redlock 实例。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | Redlock 获取成功时 3 个实例持有同一 owner token | `GET` 三实例 | **成立**：okCount=3，token 一致 |
| H2 | 持锁期间竞争客户端无法获取 | 第二个 `acquire` | **成立**：返回 null |
| H3 | 错误 token 不会删除他人锁 | Lua compare-and-delete | **成立**：删除 0，锁保持 |
| H4 | 存活实例少于 quorum 时获取失败 | 指向 7998/7999 未监听端口 | **成立**：1/3、1/2 都失败；2/2 成功 |
| H5 | 锁过期后旧 owner 的晚到写会覆盖新值 | 无 fencing 写两次 | **成立**：状态被 `stale-write` 覆盖 |
| H6 | fencing token 能拒绝 stale writer | `UPDATE ... WHERE fencing < $new` | **成立**：旧 token=1 更新 0 行，保留 fencing=2 |
| H7 | 重复请求只执行一次 handler 并复用响应 | 同 body 两次 | **成立**：created/duplicate，handler calls=1 |
| H8 | 同 key 不同 body 必须冲突 | 第 3 次换 body | **成立**：conflict |

## 3. 环境

```text
OS        : Windows 10.0.28000 x64
Node      : v24.15.0
Redlock   : Redis 8.10.3 × 3（7001/7002/7003，D:/Redis8/Redis-8.10.3-Windows-x64-msys2）
Cache对照 : Redis 3.0.504（127.0.0.1:6379，DB 15）
PostgreSQL: 18.6（study_lab，schema e09）
凭据      : PGPASSWORD 只从环境变量读取；不写入仓库
```

Redis 7 及以上均可；本机使用 redis-windows 的 8.10.3 构建。`REDIS_BIN` 可覆盖二进制路径，`REDLOCK_PORTS` 可覆盖端口。

## 4. 执行命令

```bash
cd 06-实验代码/E09-redis-cache
npm ci
PGPASSWORD=<local-test-password> npm test
PGPASSWORD=<local-test-password> bash scripts/run_evidence.sh
echo $?
```

直接跑 Redlock 场景（脚本会自行启动/停止 7001-7003）：

```bash
PGPASSWORD=<local-test-password> node src/redlock_evidence.mjs
```

## 5. 关键实现

```js
// 获取：所有实例 SET NX PX，成功数 >= quorum 且剩余有效期 > 0
SET lock:order-1 <token> NX PX 2000

// 释放 / 续租：Lua 先比对 token，避免误删他人锁
if redis.call("get", KEYS[1]) == ARGV[1]
then return redis.call("del", KEYS[1]) else return 0 end

// fencing：数据库只接受更大的 token
UPDATE e09.orders SET status = $1, fencing = $2
WHERE id = 1 AND fencing < $2;

// 幂等：主键冲突后比对 body 哈希
INSERT INTO e09.idempotency (key, body_hash, response)
VALUES ($1, $2, '') ON CONFLICT (key) DO NOTHING;
```

## 6. 结果

| 项 | 实际 | 证据 |
| --- | --- | --- |
| 实例 | 3 个独立实例，quorum=2 | `evidence/redlock.txt` |
| 获取 | okCount=3，validity≈1976.8ms | `evidence/redlock.txt` |
| 竞争 | 第二客户端返回 null | `evidence/redlock.txt` |
| 误删 | 错误 token 删除 0，锁保持 | `evidence/redlock.txt` |
| quorum | 1/3、1/2 失败；2/2 成功 | `evidence/redlock.txt` |
| 续租 | PTTL 1199ms，token 不变 | `evidence/redlock.txt` |
| 过期 | 300ms TTL + 450ms 暂停后新 token 接管 | `evidence/redlock.txt` |
| stale 写 | 无 fencing 覆盖；有 fencing 旧 token 被拒 | `evidence/redlock.txt` |
| 幂等 | created → duplicate（handler 1 次）→ conflict | `evidence/redlock.txt` |
| Cache Aside | 5 条回归全过 | `evidence/test.txt` |
| 门禁 | 11 tests pass 0 fail，`gate_failures: 0` | `evidence/test.txt`、`evidence/run.txt` |

## 7. 边界

1. 三实例同机同构建；不代表真实多机房 Redlock 的安全性。
2. 进程暂停是模拟；未测 STW、时钟漂移与网络分区。
3. quorum 丢失用未监听端口模拟；未测实例恢复后的旧 token。
4. fencing 只覆盖单表单行；多写者、事务隔离、迁移未测。
5. 幂等无 TTL 清理与并发同 key 的隔离设计。
6. Cache Aside 在旧 Redis 3.0.504 上回归，与 Redlock 实例不是同一服务。
7. 没有接入项目 02 的订单流程；不能据此宣称 G5/G6 通过。

## 8. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M09 缓存与并发 | 部分 | Cache Aside、锁、幂等 |
| M12 发布与可靠性 | 部分 | 过期/续租/fencing；无网络分区 |
| E09 | **本实验** | Redlock + fencing + 幂等 |
| G5/G6 | 仅子项 | 不代表关口通过 |

## 9. 目录结构

```text
E09-redis-cache/
├── src/
│   ├── redis.mjs            最小 RESP 客户端
│   ├── cluster.mjs          启动/停止 3 个 Redis 实例
│   ├── redlock.mjs          Redlock（acquire/release/extend）
│   ├── fencing.mjs          PG fencing + 幂等表
│   └── redlock_evidence.mjs 场景取证入口
├── tests/
│   ├── cache.test.js        Cache Aside 回归（5 条）
│   └── redlock.test.js      锁/误删/quorum/stale/续租/幂等（6 条）
├── scenarios/               01 锁过期、02 quorum 丢失、03 幂等冲突
├── scripts/env.mjs / run_evidence.sh
├── evidence/                env/redlock/test/run
└── package.json / package-lock.json
```
