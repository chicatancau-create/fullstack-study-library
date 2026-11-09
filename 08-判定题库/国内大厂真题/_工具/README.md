# 真题库工具（字段分离与质量门禁）

> 对六家公司 `题目索引.json` 做字段规范化，并提供可重复的质量门禁。

## 字段规范

每题新增/拆分以下字段，保留原有字段：

| 字段 | 含义 |
| --- | --- |
| `question_url` | LeetCode 题面链接（不是面经证据） |
| `aggregate_source_url` | CodeTop 聚合 API 链接 |
| `primary_evidence` | 原始面经证据数组；当前全部为空 |
| `evidence_status` | `third_party_aggregate` / `primary_verified` |
| `evidence_note` | 未核源说明 |
| `role_recorded` | 原数据里的岗位字段 |
| `role_class` | 归一后的岗位分类；原始面经没写岗位时统一为 `岗位未标注` |
| `role_source` | 岗位判断来源；当前为 `codetop_aggregate` |

## 当前结果

- 250 题全部完成字段分离
- `primary_evidence`：0 题（尚未采集牛客原帖）
- `role_class = 岗位未标注`：250 题（不再统一推断为“后端”）
- 岗位矩阵：六家公司 × `岗位未标注`

## 运行

```bash
cd 08-判定题库/国内大厂真题/_工具
node normalize_questions.mjs   # 幂等：重复执行不会丢字段
node check_bank.mjs            # 质量门禁，失败退出码非 0
```

输出：`evidence/evidence-index.json`、`evidence/bank-check.json`、`岗位矩阵.csv`。

## 边界

- 没有采集任何牛客页面；`primary_evidence` 为空是事实，不是遗漏。
- `role_class` 未做推断；若要细分前端/全栈，必须逐题补原始面经的岗位依据。
- 质量门禁只校验结构与来源字段，不校验答案质量（答案尚未逐题补齐）。
