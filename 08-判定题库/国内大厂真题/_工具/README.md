# 真题库工具（字段分离与质量门禁）

> 对六家公司 `题目索引.json` 做字段规范化，并提供可重复的质量门禁。

## 字段规范

每题新增/拆分以下字段，保留原有字段：

| 字段 | 含义 |
| --- | --- |
| `question_url` | LeetCode 题面链接（不是面经证据） |
| `aggregate_source_url` | CodeTop 聚合 API 链接 |
| `primary_evidence` | 原始面经证据数组；由 `collect_interview_evidence.mjs` 采集写入 |
| `evidence_status` | `third_party_aggregate` / `primary_verified` |
| `evidence_note` | 未核源说明 |
| `role_recorded` | 原数据里的岗位字段 |
| `role_class` | 归一后的岗位分类；原始面经没写岗位时统一为 `岗位未标注` |
| `role_source` | 岗位判断来源；当前为 `codetop_aggregate` |

## 当前结果

- 250 题全部完成字段分离
- `primary_evidence`：只有经 `collect_interview_evidence.mjs` 实测命中并人工复核的题才算；其余仍是 `third_party_aggregate`，不冒充已核验
- `role_class = 岗位未标注`：未被原始面经覆盖的题保持未标注（不再统一推断为“后端”）
- 岗位矩阵：按 `primary_evidence` 实际覆盖生成

## 运行

```bash
cd 08-判定题库/国内大厂真题/_工具
node normalize_questions.mjs   # 幂等：重复执行不会丢字段
node check_bank.mjs            # 质量门禁，失败退出码非 0

# 采集原始面经（渲染公开牛客页；需本机 Edge/Chrome）
node collect_interview_evidence.mjs --company=字节跳动 --max-pages=2 --max-posts=40
node link_evidence.mjs         # 把证据回写到各公司 题目索引.json
node verify_evidence_links.mjs # 复验链接状态码与标题
node ms10_status.mjs           # 汇总当前覆盖率
```

输出：`evidence/evidence-index.json`、`evidence/bank-check.json`、`岗位矩阵.csv`。

## 边界

- 采集只处理**公开可访问**的牛客页面：登录墙/仅作者可见/内容已删除一律记 `blocked` 并停止，不绕过、不猜 URL。
- 匹配只认题号、LeetCode slug、「题号+题名」或公司内唯一题名，并要求同行具备涉题语境；同一行出现别的题号即判为那题，避免 212→79 之类错配。
- 多公司合辑帖、资料/外链合集、非面经帖一律不采，避免把别家面经或博客清单当成某家的真题。
- 覆盖率必须与 `ms10_status.mjs` 一致；聚合来源不得写成已核验真题。
- 质量门禁只校验结构与来源字段，不校验答案质量。
