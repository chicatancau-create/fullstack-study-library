# G4 故障变体（第二套抽测）

在答案上制造受控缺陷，确认 `grade-db.mjs` 会失败；修复后再次通过。

| 编号 | 注入缺陷 | 应失败的断言 | 已实测输出 |
| --- | --- | --- | --- |
| M1 | `listTasks` 去掉租户条件（保留占位符占位） | `D1 跨租户列表为空` | 读到 `k-t2-1` |
| M2 | `searchTasks` 改回字符串拼接 | `D3 注入不泄露他租户` | 读到 `k-t2-1` |
| M3 | `updateTaskTitle` 去掉 `AND version = $4` | `D5 版本不匹配拒绝更新` | 版本 99 也改成功 |
| M4 | `listTasks` 改回 `OFFSET` 语义 | `D8 keyset 分页不重不漏` | 取到 30 行、只有 10 个唯一 id |

四条由 `scripts/mutation_check.mjs` 自动复现（变体文件生成在包内 `.g4-mut/`，运行后删除），`npm run evidence` 写进 `evidence/mutation.txt`。

## 手工变体

| 编号 | 注入缺陷 | 观察点 |
| --- | --- | --- |
| M5 | `renameProjectAtomically` 用 `pool.query` 代替同一个 `client` | D9：项目名被改且不回滚 |
| M6 | 迁移 down 忘记删列 | `db/migrate_rollback.sql` 重跑报“列已存在” |

## 记录模板

```
变体编号：M3
缺陷描述：updateTaskTitle 去掉 AND version = $4
失败断言：D5 版本不匹配拒绝更新（返回 null 且数据未变）
复现命令：node scripts/mutation_check.mjs   # 或手工 node 自测脚本/grade-db.mjs <变体>
失败输出：FAIL D5 ...: [{"id":"k-t1-1","title":"改坏","version":2},"改坏:2"] != [null,"T1 任务 1:1"]
修复后输出：checks=10 fails=0
```
