# RAG Golden Set · 真实环境层

> 在原有纯 Python 离线管线之外，增加一层真实 PostgreSQL 存储与混合检索，使用同一份 65 条 golden set 复核检索质量。

## 覆盖

| 能力 | 实现 |
| --- | --- |
| 语料入库 | 17 篇三租户文档 → 按句打包分块（≤220 字符）→ `rag_real.chunks` |
| 向量存储 | PostgreSQL `float8[]` + SQL 余弦相似度（`flat-sql-cosine-v1`）；本机无 pgvector 扩展，未使用 ANN 索引 |
| 嵌入 | `local-hash-bigram-v1`：字符/双字 n-gram SHA-256 哈希到 256 维并 L2 归一化，确定性可复现；`OPENAI_API_KEY` 存在时仅声明适配器，本次未调用 |
| 混合检索 | 租户前置过滤 + BM25（JS 实现）+ 向量召回 + 文档级加权 RRF（BM25 权重 2、向量权重 1） |
| 指标 | recall@3、纯 BM25 对照、跨租户泄漏、P95 延迟、上下文 token 估算 |
| 元数据 | 模型/维度/归一化/分块策略/索引版本/语料快照哈希/许可证，写入 `rag_real.corpus_meta` |

## 执行

```bash
cd 08-判定题库/专题题库/RAG-GoldenSet/真实环境
npm install --no-audit --no-fund
PGPASSWORD=<local-test-password> bash run.sh
```

输出：`evidence/eval.txt`、`evidence/eval.json`。

## 指标（本机实测）

- 检索题 30 条：混合 recall@3 = 100%，纯 BM25 = 100%
- 跨租户泄漏 = 0（40 条查询的检索结果均限定在 principal 租户）
- P95 = 本机个位数毫秒；上下文约 83 tokens/题（字符数 / 4 估算）

## 边界

- **未接入神经 embedding 模型**：本机无 BGE/E5/OpenAI 凭据与模型缓存；`local-hash` 是可重复基线，不代表语义嵌入质量。
- **未使用 pgvector**：本机 PostgreSQL 18.6 未安装 `vector` 扩展，向量以 `float8[]` 存于表中并用 SQL 逐行计算余弦；语料仅 17 篇， brute-force 不影响当前指标，不能外推到大规模。
- **未接真实 LLM 生成**：本层只验证检索与租户隔离，不作答、不评 faithfulness。
- **语料仍是仓库内合成运维文档**，不是外部企业语料；许可证与快照哈希已记录。
- 延迟为本机单次实测，不是生产承诺。
