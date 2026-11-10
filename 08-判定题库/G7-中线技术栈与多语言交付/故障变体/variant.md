# G7 故障变体（第二套抽测）

在答案上制造受控缺陷，确认 `grade-mysql.mjs` 会失败；修复后再次通过。

| 编号 | 注入缺陷 | 应失败的断言 | 已实测输出 |
| --- | --- | --- | --- |
| M1 | 删掉 `SET TRANSACTION ISOLATION LEVEL` | `M1 READ UNCOMMITTED 能脏读未提交值` | `5 != 99` |
| M2 | 扣减改回先查后改 | `M3 不超卖` | `[false,true,-5] != [true,true,4]` |
| M3 | 座位查询去掉 `FOR UPDATE` | `M5 并发抢同座位只有 1 人成功` | `[2,1] != [1,1]` |
| M4 | 乐观锁 `UPDATE` 去掉 `AND version = ?` | `M4 乐观锁同版本只有 1 个赢` | `[10,10] != [1,1]` |

四条由 `scripts/mutation_check.mjs` 自动复现（变体在包内 `.g7-mut/`，跑完删除），`npm run evidence` 写进 `evidence/mutation.txt`。

## 手工变体

| 编号 | 注入缺陷 | 观察点 |
| --- | --- | --- |
| M5 | `deadlockDemo` 两条连接都按 s2→s3 加锁 | 不再出现 1213（顺序一致不会死锁） |
| M6 | 乐观锁在高并发下不加版本条件 | `version` 只 +1 但卖了多件（丢失更新） |

## 记录模板

```
变体编号：M3
缺陷描述：acquireSeat 的 SELECT 去掉 FOR UPDATE
失败断言：M5 并发抢同座位只有 1 人成功
复现命令：node scripts/mutation_check.mjs
失败输出：FAIL M5 并发抢同座位只有 1 人成功: [2,1] != [1,1]
修复后输出：checks=7 fails=0
```
