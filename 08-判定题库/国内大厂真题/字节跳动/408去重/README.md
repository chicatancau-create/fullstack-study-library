# 字节跳动 408 · 去重账本

> 把三个公开 CSV 仓库中的字节跳动题单合成一份可复核的账本：每条原始记录都有去向，重复来源保留映射，不删除历史。

## 输入镜像

| 来源 | 上游 | 文件数 | 原始记录 |
| --- | --- | --- | --- |
| krishnadey30 | https://github.com/krishnadey30/LeetCode-Questions-CompanyWise | 5（1 年/2 年/6 月/全量/byteDanceToutiao） | 413 |
| liquidslr | https://github.com/liquidslr/leetcode-company-wise-problems | 5（30 天/3 月/6 月/>6 月/All） | 112 |
| snehasishroy | https://github.com/snehasishroy/leetcode-companywise-interview-questions | 3（all/>6 月/6 月） | 125 |

- 文件路径、行数、SHA-256、归档快照与抓取时间见 `input-manifest.json`。
- 原始文件位于仓库外层的 `05-外部资料库/题库/公司高频题/`，只读引用，不复制、不修改。

## 五个口径（本次实测）

| 口径 | 数值 | 说明 |
| --- | --- | --- |
| 原始记录数 | 650 | 13 个 CSV 的数据行，含不同时间窗口的重复 |
| 有效题目记录数 | 650 | 都能解析出 LeetCode ID 或 slug |
| 本地题面连接命中数 | 367 行 | 有 367 行能匹配到当前 `题目索引.json` 的题 |
| 去重后唯一题数 | 211 | 以 `leetcode-id` / `slug` 为 canonical key |
| 有原始面经证据的题数 | 0 | 当前只有第三方聚合，尚无逐题牛客原帖 |

**结论：** 早先“408 题”的说法无法从这三个来源复现。原始记录 650 条是含时间窗口重复的计数，去重后只有 211 道唯一题。本账本不再把 408 当作既定事实。

## 与当前 CodeTop 100 的关系

| 关系 | 数量 |
| --- | --- |
| `already_present`（CSV 能对上现有题） | 76 / 100 |
| `new_from_csv`（CSV 独有） | 101 |
| `possible_alias`（标题归一后同组但 canonical 不同） | 57 组 |
| `conflict`（同一 LeetCode ID 出现不同标题） | 0 |
| `unmatched_current`（现有题在 CSV 未出现） | 24 |
| `unmatched_csv`（CSV 独有） | 101 |

当前 100 题与 CSV 不是互相独立的集合：76 题已有交集，24 题只在 CodeTop 出现，101 题只在 CSV 出现。

## 账本字段

`dedupe-ledger.csv` 每行对应一条原始记录：

`raw-source, snapshot, file, row, raw-title, leetcode-id, slug, canonical-id, match-type, duplicate-of, local-question-id, current-codetop-id, decision, exclusion-reason`

- `canonical-id`：优先 `lc:<LeetCode ID>`，其次 `lc:<slug>`，最后 `title:<归一化标题>`。
- `match-type`：`leetcode-id` / `slug` / `title-normalized`。
- `duplicate-of`：同一 canonical 的首次出现位置；重复记录仍保留在账本中。
- `decision`：`included`（该 canonical 首次出现）或 `excluded`（重复/无键）。
- `exclusion-reason`：`duplicate-of-earlier-record` 或 `missing-title-and-id`。

## 运行

```bash
cd 08-判定题库/国内大厂真题/字节跳动/408去重
bash run.sh
```

输出：`input-manifest.json`、`dedup-ledger.csv`、`summary.json`、`evidence/run.txt`。

## 边界

- CSV 是社区维护的历史快照，不是公司官方题库；标题与时间窗口可能过期。
- 去重键以 LeetCode ID/slug 为准；`possible_alias` 只是标题归一后的候选组，**未做人工逐组复核**，不自动合并。
- `evidence_backed_questions = 0`：尚未采集牛客原帖，不能把这些题计入“已核验真题”。
- 未抓取任何新页面，未绕过登录/验证码，未转载题解正文。
