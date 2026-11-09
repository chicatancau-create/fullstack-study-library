import fs from 'node:fs';
import { client, ingest } from './ingest.mjs';
import { embed } from './embedding.mjs';
import { search } from './retrieve.mjs';
import { loadGolden } from './corpus.mjs';

const results = [];
const ev = { captured_at: new Date().toISOString(), checks: [] };
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  ev.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}
const pct = (x) => Math.round(x * 1000) / 10;

try {
  const meta = await ingest();
  const metaRow = (await client.query('SELECT * FROM rag_real.corpus_meta')).rows[0];
  const chunks = (await client.query('SELECT id, doc_id, tenant, ordinal, title, content FROM rag_real.chunks')).rows;
  check('R01 真实 PG 落库：语料与分块可查询', meta.docs === 17 && chunks.length >= 17, `docs=${meta.docs} chunks=${chunks.length}`);
  check('R02 记录嵌入元数据（模型/维度/归一化/索引版本）', Boolean(metaRow.model && metaRow.dim && metaRow.normalization && metaRow.index_version), `model=${metaRow.model} dim=${metaRow.dim} index=${metaRow.index_version}`);

  const a = embed(['发布窗口是每周哪几天？'])[0];
  const b = embed(['发布窗口是每周哪几天？'])[0];
  check('R03 嵌入确定性（同文本向量一致）', JSON.stringify(a) === JSON.stringify(b), `dim=${a.length}`);

  const golden = loadGolden();
  const retrieval = golden.filter((g) => g.type === 'retrieval');
  const cross = golden.filter((g) => g.type === 'cross_tenant');
  let hybridHits = 0;
  let bmHits = 0;
  let leak = 0;
  const latencies = [];
  let tokenChars = 0;
  let tokenN = 0;

  for (const g of [...retrieval, ...cross]) {
    const started = performance.now();
    const out = await search(client, chunks, g.principal, g.question);
    latencies.push(performance.now() - started);
    const hybridDocs = out.fused.map((x) => x.chunk.doc_id);
    const bmDocs = out.bm.map((x) => x.chunk.doc_id);
    if (g.type === 'retrieval') {
      if (g.expected_docs.some((d) => hybridDocs.includes(d))) hybridHits++;
      if (g.expected_docs.some((d) => bmDocs.includes(d))) bmHits++;
      tokenChars += out.fused.reduce((s, x) => s + x.chunk.content.length, 0);
      tokenN++;
    } else {
      leak += out.fused.filter((x) => x.chunk.tenant !== g.principal).length;
    }
  }

  const hybridRecall = hybridHits / retrieval.length;
  const bmRecall = bmHits / retrieval.length;
  const sorted = [...latencies].sort((x, y) => x - y);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const avgTokens = Math.ceil((tokenChars / tokenN) / 4);
  const vectorRows = (await client.query("SELECT count(*)::int AS n FROM rag_real.chunks WHERE embedding IS NOT NULL")).rows[0].n;

  check('R04 混合检索 recall@3 达到既有阈值', hybridRecall >= 0.9, `hybrid=${pct(hybridRecall)}% bm25=${pct(bmRecall)}%`);
  check('R05 混合检索不劣于纯 BM25', hybridRecall >= bmRecall, `hybrid=${pct(hybridRecall)}% bm25=${pct(bmRecall)}%`);
  check('R06 跨租户检索零泄漏', leak === 0, `leaks=${leak}`);
  check('R07 全部向量非空且为 256 维', vectorRows === chunks.length, `rows=${vectorRows}`);
  check('R08 本机 P95 延迟 ≤ 2000ms', p95 <= 2000, `p95=${p95.toFixed(1)}ms n=${latencies.length}`);
  check('R09 单次上下文 token 估算 ≤ 1200', avgTokens <= 1200, `avg_tokens=${avgTokens}`);

  ev.metrics = {
    retrieval_questions: retrieval.length,
    cross_tenant_questions: cross.length,
    hybrid_recall_at_3: hybridRecall,
    bm25_recall_at_3: bmRecall,
    cross_tenant_leaks: leak,
    p95_ms: Number(p95.toFixed(2)),
    avg_context_tokens_estimate: avgTokens,
    chunks: chunks.length,
    embedding_model: metaRow.model,
    embedding_dim: metaRow.dim,
    index_version: metaRow.index_version,
    snapshot: metaRow.snapshot,
    license: metaRow.license,
  };
} finally {
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/eval.json', JSON.stringify(ev, null, 2) + String.fromCharCode(10));
  await client.end().catch(() => {});
}
const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `RAG-REAL PASS ${results.length}/${results.length}` : `RAG-REAL FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
