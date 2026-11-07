# E09：Redis Cache Aside 与过期写回

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E09。
> 本实验在**真实 Redis 3.0.504（Windows 移植版）** 的 DB 15 上做 Cache Aside、陈旧回填复现与版本键修复；不覆盖集群/哨兵/持久化。
> 环境：Windows 10.0.28000 + Node v24.15.0 + Redis 3.0.504（127.0.0.1:6379）

## 1. 做了什么、没做什么

做了什么：

- 用最小 RESP 客户端连接真实 Redis，`SELECT 15` 隔离实验数据，`KEYS e09:*` 清理。
- Cache Aside：miss 回源、写入缓存、第二次命中。
- 复现“旧读晚写回”：reader 读到 old → writer 更新 DB 并删缓存 → reader 晚写回 old → 缓存旧值。
- 修复：版本化 key `item:1:vN`；旧 reader 写回 v1 不会被新 reader 的 v2 命中。
- Redis 不可用：连接 6399 失败时降级到 DB，并标记 `degraded`。
- 5 条真实 Redis 测试，全部通过。

没做什么：

- Redis 3.0.504 是 Microsoft Archive 的旧移植版；没有 Redis 6/7 的 ACL/多线程 I/O。
- 没有 Sentinel/Cluster/主从/持久化/淘汰策略；没有故障切换。
- DB 是进程内 Map，不是真实数据库；没有 HTTP/API 层。
- 没有测 TTL 精确过期、击穿/雪崩、热点 key、负缓存。
- 没有真实业务一致性/对账。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | Cache Aside 第二次读命中 | GET miss → 回源 SET → 再 GET | **成立**：`hit=false` 后 `hit=true` |
| H2 | 旧读晚写回会让缓存出现陈旧值 | 手动交错 GET/DB 更新/DEL/SET | **成立**：缓存 old，DB new |
| H3 | 版本化 key 让旧写回失效 | v1/v2 双 key | **成立**：新 reader 读 v2=new |
| H4 | Redis 不可用时可降级到 DB | 连接 6399 失败 | **成立**：`degraded=true`，返回 DB 值 |
| H5 | 实验不污染其他 Redis 数据 | 只用 DB 15 + `e09:*` 前缀 | 成立（代码约束） |

## 3. 环境

```text
OS     : Windows 10.0.28000 x64
Node   : v24.15.0
Redis  : 3.0.504（D:\Redis，服务 Redis，127.0.0.1:6379）
DB     : 15（隔离）
客户端 : 自写最小 RESP（无第三方依赖）
```

## 4. 执行命令

```bash
cd 06-实验代码/E09-redis-cache
bash scripts/run_evidence.sh
echo $?
```

## 5. 关键序列

陈旧回填：

```text
reader: GET cache -> nil
reader: DB -> old
writer: DB = new
writer: DEL cache
reader: SET cache old   # 晚写回
GET cache -> old        # 陈旧
DB -> new
```

版本键：

```text
DB: {value: old, version: 1}; SET item:1:v1 old
DB: {value: new, version: 2}; SET item:1:v2 new; DEL item:1:v1
late reader: SET item:1:v1 old
new reader: GET item:1:v2 -> new
```

## 6. 结果

| 用例 | 实际 | 证据 |
| --- | --- | --- |
| 基本读写 | PING/SET/GET/DEL 正常 | `evidence/test.txt` |
| Cache Aside | miss → hit | `evidence/test.txt` |
| 陈旧回填 | 缓存 old、DB new | `evidence/test.txt` |
| 版本键 | 新 reader 仍读 new | `evidence/test.txt` |
| 宕机降级 | `degraded=true` | `evidence/test.txt` |
| 门禁 | `tests 5 pass 5 fail 0` | `evidence/run.txt` |

## 7. 边界

1. Redis 3.0.504 旧；行为以 `INFO server` 实测为准，不能外推 Redis 7。
2. 单机、无 Sentinel/Cluster/持久化/淘汰；没有故障切换。
3. DB 是内存 Map；没有真实 SQL/事务/主从延迟。
4. 没有 TTL 精确性、击穿/雪崩/热点/负缓存实验。
5. 版本键是应用层协议；旧版本 key 仍需清理策略，否则会积累。
6. 不能据此宣称强一致；只说明“本协议下旧写回不被新读命中”。

## 8. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M08 分布式语义 | 部分 | Cache Aside、陈旧窗口、版本键、降级 |
| E09 | **本实验** | 无集群/持久化/真实 DB |
| G5 | 仅缓存子项 | 不代表 G5 通过 |

## 9. 目录结构

```text
E09-redis-cache/
├── src/redis.mjs        最小 RESP 客户端（SELECT 15）
├── tests/cache.test.js  5 条真实 Redis 测试
├── scripts/env.mjs      PING + INFO server
├── scripts/run_evidence.sh
├── evidence/            env/test/run + manifest
└── README.md```
