import { writeFileSync, mkdirSync } from 'node:fs';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';

const CONCURRENCY = 100;
const STOCK = 10;

function percentile(sorted, p) {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function run(label, strategy) {
  const pool = createPool();
  await pool.query('TRUNCATE p03.notifications, p03.inbox, p03.outbox, p03.payment_events, p03.order_items, p03.audit_log, p03.payment_attempts, p03.payments, p03.refunds, p03.orders RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE p03.inventory, p03.products CASCADE');
  await pool.query("INSERT INTO p03.products (sku, title, price_cents) VALUES ('sku-1','机械键盘',299)");
  await pool.query("INSERT INTO p03.inventory (sku, title, unit_price, stock) VALUES ('sku-1','机械键盘',299,$1)", [STOCK]);

  const app = buildApp({ pool, lockStrategy: strategy });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${app.server.address().port}`;

  const latencies = [];
  const codes = [];
  const begin = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async (_, i) => {
    const started = performance.now();
    const res = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'test-key', 'x-user-id': 'load-user', 'idempotency-key': `load-${label}-${i}-${Date.now()}` },
      body: JSON.stringify({ sku: 'sku-1', qty: 1 }),
    });
    latencies.push(performance.now() - started);
    codes.push(res.status);
    await res.arrayBuffer();
  }));
  const wallMs = performance.now() - begin;
  latencies.sort((a, b) => a - b);

  const stock = (await pool.query("SELECT stock FROM p03.inventory WHERE sku = 'sku-1'")).rows[0].stock;
  const orders = (await pool.query('SELECT count(*)::int AS n FROM p03.orders')).rows[0].n;
  const negative = (await pool.query('SELECT count(*)::int AS n FROM p03.inventory WHERE stock < 0')).rows[0].n;

  const result = {
    strategy,
    concurrency: CONCURRENCY,
    stock_initial: STOCK,
    wall_ms: Math.round(wallMs),
    qps: Number((CONCURRENCY / (wallMs / 1000)).toFixed(2)),
    created: codes.filter((c) => c === 201).length,
    rejected: codes.filter((c) => c === 409).length,
    other: codes.filter((c) => c !== 201 && c !== 409),
    p50_ms: Number(percentile(latencies, 50).toFixed(2)),
    p95_ms: Number(percentile(latencies, 95).toFixed(2)),
    p99_ms: Number(percentile(latencies, 99).toFixed(2)),
    max_ms: Number(latencies[latencies.length - 1].toFixed(2)),
    final_stock: stock,
    orders,
    negative_stock_rows: negative,
  };
  await app.close();
  await pool.end();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

mkdirSync('evidence', { recursive: true });
const results = {};
results.row = await run('row', 'row');
results.optimistic = await run('optimistic', 'optimistic');
writeFileSync('evidence/load-locks.json', `${JSON.stringify(results, null, 2)}\n`);
for (const r of Object.values(results)) {
  if (r.created !== STOCK || r.final_stock !== 0 || r.negative_stock_rows !== 0) process.exitCode = 1;
}
