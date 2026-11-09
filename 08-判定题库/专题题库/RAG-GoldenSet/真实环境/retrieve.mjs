import { embed, tokenize } from './embedding.mjs';

export function buildBm25(chunks) {
  const k1 = 1.2;
  const b = 0.75;
  const tfs = chunks.map((c) => {
    const map = new Map();
    for (const t of tokenize(`${c.title} ${c.content}`)) map.set(t, (map.get(t) || 0) + 1);
    return map;
  });
  const lens = chunks.map((c) => tokenize(`${c.title} ${c.content}`).length);
  const avg = lens.reduce((a, b2) => a + b2, 0) / chunks.length;
  const df = new Map();
  for (const map of tfs) for (const t of map.keys()) df.set(t, (df.get(t) || 0) + 1);
  const n = chunks.length;
  const idf = new Map([...df].map(([t, c]) => [t, Math.log((n - c + 0.5) / (c + 0.5) + 1)]));
  return (query) => {
    const q = [...new Set(tokenize(query))];
    return chunks.map((c, i) => {
      let score = 0;
      for (const t of q) {
        const f = tfs[i].get(t) || 0;
        if (!f) continue;
        score += (idf.get(t) || 0) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * lens[i] / avg));
      }
      return { chunk: c, score };
    });
  };
}

export async function vectorSearch(client, chunks, tenant, query, limit = 10) {
  const vec = embed([query])[0];
  const res = await client.query(
    `SELECT id, doc_id, tenant, ordinal, title, content,
            1 - (SELECT sum(a * b) FROM unnest(embedding, $2::float8[]) AS u(a, b)) AS sim
     FROM rag_real.chunks
     WHERE tenant = $1
     ORDER BY sim DESC
     LIMIT $3`,
    [tenant, vec, limit],
  );
  return res.rows.map((r) => ({ chunk: r, score: Number(r.sim) }));
}

// 文档级加权 RRF：同一文档只取最佳分块，避免多分块重复占位。
export function fuse(rankings, k = 60, limit = 3) {
  const scores = new Map();
  const byDoc = new Map();
  for (const { items, weight = 1 } of rankings) {
    const seen = new Set();
    for (const item of items) {
      const doc = item.chunk.doc_id;
      if (seen.has(doc)) continue;
      seen.add(doc);
      scores.set(doc, (scores.get(doc) || 0) + weight / (k + seen.size));
      if (!byDoc.has(doc)) byDoc.set(doc, item.chunk);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([doc, score]) => ({ chunk: byDoc.get(doc), rrf: score }));
}

export async function search(client, chunks, principal, question) {
  const bm25 = buildBm25(chunks.filter((c) => c.tenant === principal));
  const bmRanking = bm25(question).sort((a, b) => b.score - a.score).slice(0, 10);
  const dense = await vectorSearch(client, chunks, principal, question, 10);
  const fused = fuse(
    [
      { items: bmRanking, weight: 2 },
      { items: dense, weight: 1 },
    ],
    60,
    3,
  );
  return { fused, bm: bmRanking.slice(0, 3), dense: dense.slice(0, 3) };
}
