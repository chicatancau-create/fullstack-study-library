# 项目 03 代码审查记录

- 日期：2026-11-07
- 范围：`src/app.js`、`migrations/001_init.sql`、`scripts/load.mjs`、`scripts/backup.mjs`
- 方式：自审 + AI 复审（无人类同伴参与）

## 阻断项（已修复）

1. **连接池饥饿**：事务持有 client 期间又向 pool 申请连接，并发超过 `max` 时整体挂起。
   修复为复用当前 client；见 [bugs/001-pool-starvation.md](bugs/001-pool-starvation.md)。
2. **Windows 备份脚本找不到 pg_dump**：`spawnSync` 依赖 PATH，失败时 `stderr` 为空导致误报。
   修复为显式使用 `PG_BIN`（默认 `D:/PostgreSQL/18/bin`），错误信息包含 `error.message`。

## 建议项（未在本轮实施）

1. 订单参数目前只接受单 SKU；多商品订单需要拆 `order_items` 写入循环并把金额汇总放进同一事务。
2. 未实现订单超时自动取消；真实交易需要定时任务或延迟消息，并处理“取消与支付”同样的竞争。
3. 回调签名覆盖 `JSON.stringify(body)`，依赖字段顺序；真实网关应使用原始请求体字节验签。
4. `x-user-id` 由网关注入是 Demo 简化；生产必须从认证令牌解析用户，不能信任客户端头。
5. 压测尾延迟偏高（P99 约 0.9s）来自单 SKU 行锁排队，需要分桶或排队削峰。

## 已验证

- 鉴权失败、参数非法、未知 SKU、库存不足、幂等冲突均有对应状态码。
- 取消/支付的并发终态与库存一致（15 个测试包含该场景）。
- 备份恢复后行数一致，`pg_dump` 产物仅含合成数据。
