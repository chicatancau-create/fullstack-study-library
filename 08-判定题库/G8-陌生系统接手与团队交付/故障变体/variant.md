# G8 故障变体（第二套抽测）

在答案上制造受控缺陷，确认 `grade-legacy.mjs` 会失败；修复后再次通过。

| 编号 | 注入缺陷 | 应失败的断言 | 已实测输出 |
| --- | --- | --- | --- |
| A | rotate 改回无条件更新（并发全部重放成功） | `A 同一 refresh 只能轮换 1 次` | `5 != 1` |
| B | 无密钥时退回常量（签名可伪造） | `B 无 JWT_SECRET 时拒绝签发` | `false != true` |
| C | 把 `error.stack` 回给调用方 | `C 不回 stack` / `C 回稳定错误码` | `true != false` |
| D | 更新不带 `version`（丢失更新） | `D 同版本只有 1 个赢` | `[5,6] != [1,2]` |
| E | 只按 `created_at` 排序（同秒不稳） | `E 同秒行按 id 降序` | `["k-acme-1","k-acme-2"] != [...]` |
| F | `getTask` 去掉租户条件 | `F 跨租户 getTask 返回 null` | 读到 `k-globex-1` |
| G | 改回前导通配 `%x%` | `G 不用前导通配 %x%` | `true != false` |

七条由 `scripts/mutation_check.mjs` 自动复现（变体在包内 `.g8-mut/`，跑完删除），`npm run evidence` 写进 `evidence/mutation.txt`。

## 手工变体

| 编号 | 注入缺陷 | 观察点 |
| --- | --- | --- |
| M8 | 把 `version` 直接加进 `db/schema.sql` | 升级已有库时结构不一致；应当只用迁移 |
| M9 | `rotateRefresh` 用同一个 `db` 连接跑并发 | 首次运行出现 `pg@9 deprecation`，并发行为不可信 |

## 记录模板

```
变体编号：D
缺陷描述：updateTask 的 WHERE 去掉 AND version = $4
失败断言：D 同版本只有 1 个赢
复现命令：node scripts/mutation_check.mjs
失败输出：FAIL D 同版本只有 1 个赢: [5,6] != [1,2]
修复后输出：checks=15 fails=0
```
