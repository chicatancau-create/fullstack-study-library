# G5 测试安全与性能 + 部署运维

> 自学自测包。函数题 + 真实交易库（100 并发抢购 / 幂等 / 对账 / 负载模型）。

## 两道子题

| 子题 | 位置 | 抓什么 |
| --- | --- | --- |
| 函数题 | `起始代码/index.mjs` → `validateOrder` | 数量、SKU 格式、XSS 字符校验 |
| 真实交易库 | `起始代码/db/trade.mjs` | 4 处真实缺陷：超卖、幂等失效、对账漏项、失败伪装成功 |

## 函数题

```bash
node 自测脚本/smoke.mjs
node 自测脚本/grade.mjs 起始代码/index.mjs
```

## 真实交易库（PostgreSQL）

只用 `study_lab` 里的 `g5_lab` schema（`stock` / `order` / `payment`）。

```bash
bash scripts/db_setup.sh                              # 建表 + 10 件库存种子
node 自测脚本/grade-trade.mjs 起始代码/db/trade.mjs
```

### 判据（`grade-trade.mjs`，15 次断言）

| 编号 | 判据 | 抓的缺陷 |
| --- | --- | --- |
| T1 | 100 并发抢 10 件 → 恰好成功 10 单、库存 0、无异常 | 先查后改的竞态超卖 |
| T2 | 同键 5 次并发 → 只落 1 单、只扣一次（5→3）、5 次都算成功 | 幂等键只在内存 |
| T3 | 库存不足 → `ok:false` 且不建单 | 失败伪装成功 |
| T4 | `qty=0` → 返回 `ok:false`，不抛约束错 | 输入校验缺失 |
| T5 | 预置少付（100 vs 80）→ 报 `paid_mismatch` 且带期望/实际 | 只比总额不报差异形 |
| T6 | 拒单却有支付 → 报 `paid_rejected` | 对账漏项 |
| T7 | `capacityEstimate` 吞吐/墙钟/饱和度；非法参数抛 `RangeError` | 负载模型 |

实测：答案 15/15；起始代码 8 条 fail。

## 并发与幂等的关键写法

- **不超卖**：`UPDATE ... SET available = available - $1 WHERE sku = $2 AND available >= $1`，用 `rowCount === 0` 判失败，整笔回滚。
- **幂等**：`INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`；`rowCount === 0` 说明是重放，回查原单返回 `replayed: true`。
- **瞬时冲突不外泄**：并发同键可能撞 `23505` / `40P01` / `40001`，最多重试 3 次；否则幂等语义会在并发下“随机失败”（实测第一次跑就出现过 4/5 成功）。
- **对账**：四账（订单额 / 支付额 / 库存变动 / 订单状态）一次查询拿全，用 `LEFT JOIN` 而不是嵌套查询。

## 证据

`npm run evidence` 生成：

- `evidence/judge-solution.txt` / `judge-starter.txt` —— 函数题
- `evidence/db-setup.txt` —— 建表与库存种子
- `evidence/trade-solution.txt` / `trade-starter.txt` —— 交易 15 条
- `evidence/mutation.txt` —— 4 个注入缺陷全部被抓

## 环境说明

- 需要本机 PostgreSQL 18 在跑，`study` 账号可写 `study_lab`。
- `pg` 8.23.1 装在包内。判分不用 `psql`（Windows 代码页会把中文参数编坏）。
- 没有数据库时 `evidence.sh` 写 `SKIP` 并返回非 0，不伪造通过。
- kind / 部署未在本包覆盖：kind 集群在 QEMU 内验证过（见 `04-资源与评估` 记录），本包只做数据库层。

## 边界

- 不测 MQ 故障注入与 kind 滚动发布；这些在 P03 项目层覆盖。
- 不引入 ORM；本题只考 SQL、事务、幂等与并发语义。
- 本包为自学设计：起手代码故意做坏，不含隔离或防作弊。
