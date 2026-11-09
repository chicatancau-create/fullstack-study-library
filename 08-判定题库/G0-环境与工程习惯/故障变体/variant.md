# G0 故障变体（第二套抽测）

在答案上制造受控缺陷，确认自测脚本会失败；修复后再次通过。记录：缺陷描述、失败的断言名、修复后的通过输出。

## 函数题（改 `参考答案/index.mjs`）

| 编号 | 注入缺陷 | 应失败的断言 |
| --- | --- | --- |
| V1 | 不跳过 `=======` 行 | `不含冲突标记` |
| V2 | 不按行去重（`seen` 去掉） | `合并双方独有行`（会出现重复行） |
| V3 | 只遍历 `ours` | `合并双方独有行`（丢 feature 侧） |

## 仓库题（改 fixture 副本）

| 编号 | 注入缺陷 | 应失败的断言 | 已实测 |
| --- | --- | --- | --- |
| M1 | 冲突只留 feature 行（丢 `LOG_LEVEL=debug`） | `R2 双方独有内容都保留` | ✅ `LOG_LEVEL=debug:false` |
| M2 | 把缺陷改回 `length - 1` | `R5 rollingSum([0,1,2,3])` | ✅ `[0,1,3] != [0,1,3,6]` |
| M3 | `git add -f config/local.env` 强推秘密入库 | `R3 合成秘密未入库` | ✅ `config/local.env` |
| M4 | 留一个未跟踪文件 | `R1 工作树干净` | ✅ `?? scratch-leftover.txt` |

M1–M4 由 `scripts/mutation_check.mjs` 自动复现，`npm run evidence` 会把它写进 `evidence/mutation.txt`。

## 记录模板

```
变体编号：M2
缺陷描述：把 src/rolling_sum.js 的循环改回 i < values.length - 1
失败断言：R5 rollingSum([0,1,2,3])
复现命令：node 自测脚本/grade-repo.mjs .
失败输出：FAIL R5 rollingSum([0,1,2,3]): [0,1,3] != [0,1,3,6]
修复后输出：checks=8 fails=0
```
