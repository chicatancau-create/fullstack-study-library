# G6 故障变体（第二套抽测）

在答案上制造受控缺陷，确认 `grade-tenant.mjs` 会失败；修复后再次通过。

| 编号 | 注入缺陷 | 应失败的断言 | 已实测输出 |
| --- | --- | --- | --- |
| M1 | `updateTask` 的 before 查询去掉 `tenant_id` | `G3 跨租户写入被拒` | `[true,"Globex 任务 1"] != [false,...]` |
| M2 | 删掉 `ROLE_RANK[role] < ROLE_RANK.member` 拦截 | `G4 viewer 写入被拒` | `true != false` |
| M3 | 审计不写 before | `G5 更新成功`（连带审计 before 缺失） | `[false,null] != [true,2]` |
| M4 | 批量单项失败直接 `throw` | `G6 逐项结果` / `G6 成功项已落库` | 三项全 false |
| M5 | 列表软删条件恒真 | `G2 已删任务默认不可见` | `["k-acme-1","k-acme-2"] != ["k-acme-1"]` |

五条由 `scripts/mutation_check.mjs` 自动复现（变体在包内 `.g6-mut/`，跑完删除），`npm run evidence` 写进 `evidence/mutation.txt`。

## 手工变体

| 编号 | 注入缺陷 | 观察点 |
| --- | --- | --- |
| M6 | 审计改成 `COMMIT` 之后单独 `INSERT` | 人为让审计插入报错，数据已提交（审计丢失） |
| M7 | 批量改成先全部校验再更新 | 并发下校验与更新之间状态可能已变（TOCTOU） |

## 记录模板

```
变体编号：M2
缺陷描述：去掉 viewer 的写入拦截
失败断言：G4 viewer 写入被拒
复现命令：node scripts/mutation_check.mjs
失败输出：FAIL G4 viewer 写入被拒: true != false
修复后输出：checks=14 fails=0
```
