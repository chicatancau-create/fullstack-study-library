import pg from 'pg';
import { embed, getProvider } from './embedding.mjs';
import { parseDocs, chunkDoc, snapshotHash } from './corpus.mjs';

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('需要 PGPASSWORD（只从环境变量读取）');
  process.exit(2);
}

export const client = new pg.Client({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password,
  database: process.env.PGDATABASE || 'study_lab',
});
await client.connect();

export async function ingest() {
  const provider = getProvider();
  const docs = parseDocs();
  const chunks = docs.flatMap((doc) => chunkDoc(doc));
  await client.query('DROP SCHEMA IF EXISTS rag_real CASCADE');
  await client.query('CREATE SCHEMA rag_real');
  await client.query(`
    CREATE TABLE rag_real.corpus_meta (
      id int PRIMARY KEY DEFAULT 1,
      snapshot text NOT NULL,
      model text NOT NULL,
      dim int NOT NULL,
      normalization text NOT NULL,
      chunk_strategy text NOT NULL,
      index_version text NOT NULL,
      license text NOT NULL,
      source text NOT NULL,
      ingested_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE rag_real.chunks (
      id bigserial PRIMARY KEY,
      doc_id text NOT NULL,
      tenant text NOT NULL,
      ordinal int NOT NULL,
      title text NOT NULL,
      content text NOT NULL,
      embedding float8[] NOT NULL,
      source text NOT NULL
    )
  `);
  await client.query('CREATE INDEX chunks_tenant_idx ON rag_real.chunks (tenant)');

  const vectors = embed(chunks.map((c) => `${c.title}。${c.content}`));
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    await client.query(
      'INSERT INTO rag_real.chunks (doc_id, tenant, ordinal, title, content, embedding, source) VALUES ($1,$2,$3,$4,$5,$6::float8[],$7)',
      [c.docId, c.tenant, c.ordinal, c.title, c.content, vectors[i], c.source],
    );
  }
  await client.query(
    `INSERT INTO rag_real.corpus_meta (snapshot, model, dim, normalization, chunk_strategy, index_version, license, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      snapshotHash(),
      provider.name,
      provider.dim,
      provider.kind === 'local' ? 'l2' : 'provider-default',
      'sentence-pack-220chars',
      'flat-sql-cosine-v1',
      'repository-authored training material (CC BY 4.0)',
      '数据/corpus',
    ],
  );
  return { docs: docs.length, chunks: chunks.length, provider };
}
