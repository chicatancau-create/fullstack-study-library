import crypto from 'node:crypto';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';

const CONCURRENCY = 20;
const REQUESTS = 240;
const STOCK = 150;

const pool = createPool();
const app = buildApp({ pool });
await pool.query("INSERT INTO p03.inventory (sku, title, unit_price, stock) VALUES ('load-sku', '压测商品', 10, $1) ON CONFLICT (sku) DO UPDATE SET stock = $1", [STOCK]);
await app.listen({ host: '127.0.0.1', port: 0 });
const base = app.server.address().port;
console.log(`load target=http://127.0.0.1:${base} concurrency=${CONCURRENCY} requests=${REQUESTS} stock=${STOCK}`);

const results = [];
const latencies = [];
let cursor = 0;

async function worker(id) {
  while (true) {
    const index = cursor++;
    if (index >= REQUESTS) return;
    const started = performance.now();
    const response = await fetch(`http://127.0.0.1:${base}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'test-key', 'x-user-id': `load-${id}`, 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ sku: 'load-sku', qty: 1 }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    latencies.push(performance.now() - started);
    results.push({ status: response.status, error: body.error });
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

const success = results.filter((r) => r.status === 201).length;
const outOfStock = results.filter((r) => r.error === 'out_of_stock').length;
const other = results.filter((r) => r.status !== 201 && r.error !== 'out_of_stock');
const stock = (await pool.query("SELECT stock FROM p03.inventory WHERE sku = 'load-sku'")).rows[0].stock;
const orders = (await pool.query("SELECT count(*)::int AS n FROM p03.orders WHERE sku = 'load-sku'")).rows[0].n;

latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1)];
console.log(`responses=${results.length} success=${success} out_of_stock=${outOfStock} other=${other.length}`);
console.log(`p50=${pct(50).toFixed(1)}ms p95=${pct(95).toFixed(1)}ms p99=${pct(99).toFixed(1)}ms max=${latencies.at(-1).toFixed(1)}ms`);
console.log(`final_stock=${stock} persisted_orders=${orders}`);

let failed = false;
if (results.length !== REQUESTS) { console.log('FAIL wrong response count'); failed = true; }
if (success !== STOCK) { console.log(`FAIL success=${success} expected=${STOCK}`); failed = true; }
if (outOfStock !== REQUESTS - STOCK) { console.log(`FAIL out_of_stock=${outOfStock} expected=${REQUESTS - STOCK}`); failed = true; }
if (other.length !== 0) { console.log('FAIL unexpected errors', other.slice(0, 3)); failed = true; }
if (stock !== 0) { console.log(`FAIL final stock=${stock}`); failed = true; }
if (orders !== STOCK) { console.log(`FAIL persisted orders=${orders}`); failed = true; }
console.log(failed ? 'LOAD FAIL' : 'LOAD PASS');

await app.close();
await pool.end();
if (failed) process.exitCode = 1;
