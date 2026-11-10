# G5 故障变体（第二套抽测）

在答案上制造受控缺陷，确认 `grade-trade.mjs` 会失败；修复后再次通过。

| 编号 | 注入缺陷 | 应失败的断言 | 已实测输出 |
| --- | --- | --- | --- |
| M1 | 完全不扣库存（`dec` 直接给 `rowCount: 1`） | `T1 100 并发抢 10 件` | `[100,0,0] != [10,0,0]` |
| M2 | 去掉 `ON CONFLICT (idempotency_key) DO NOTHING` | `T2 重放不算失败` | `1 != 5` |
| M3 | 对账不查“拒单有支付” | `T6 拒单有支付被发现` | `false != true` |
| M4 | 缺货仍返回 `ok: true` | `T1 / T3` | `[100,0,0] != [10,0,0]` |

四条由 `scripts/mutation_check.mjs` 自动复现（变体落在包内 `.g5-mut/`，跑完删除），`npm run evidence` 写进 `evidence/mutation.txt`。

## 手工变体（需观察稳定性）

| 编号 | 注入缺陷 | 观察点 |
| --- | --- | --- |
| M5 | 去掉 `23505/40P01/40001` 重试 | 连续跑 5 次 `T2 重放不算失败`，应出现偶发 fail |
| M6 | 对账把 `LEFT JOIN` 改成内连接 | `T5` 里没有支付记录的订单会消失（漏账） |

## 记录模板

```
变体编号：M2
缺陷描述：删掉 ON CONFLICT (idempotency_key) DO NOTHING
失败断言：T2 重放不算失败
复现命令：node scripts/mutation_check.mjs
失败输出：FAIL T2 重放不算失败: 1 != 5
修复后输出：checks=15 fails=0
```
