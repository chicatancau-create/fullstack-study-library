import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { enqueue, drain, runOnce, recoverStale } from '../src/jobs.mjs';

const pool = createPool();
try {
  await pool.query('TRUNCATE p04.job_results, p04.jobs RESTART IDENTITY');
  let inserted = 0;
  for (let i = 1; i <= 200; i++) {
    const id = await enqueue(pool, { tenantId: 1, kind: 'followup.reminder', dedupeKey: `job-${i}`, payload: { clientId: i } });
    if (id) inserted++;
  }
  for (let i = 1; i <= 3; i++) await enqueue(pool, { tenantId: 1, kind: 'followup.reminder', dedupeKey: 'job-1', payload: { clientId: 1 } });
  assert.equal(inserted, 200);

  const started = performance.now();
  const processed = await drain(pool, { workers: 4 });
  const elapsed = Math.round(performance.now() - started);
  const counts = (await pool.query(`SELECT
    (SELECT count(*)::int FROM p04.jobs WHERE status='done') AS done,
    (SELECT count(*)::int FROM p04.jobs WHERE status='pending') AS pending,
    (SELECT count(*)::int FROM p04.job_results) AS results`)).rows[0];
  assert.equal(processed, 200);
  assert.equal(counts.done, 200);
  assert.equal(counts.pending, 0);
  assert.equal(counts.results, 200);

  const failId = await enqueue(pool, { tenantId: 1, kind: 'followup.reminder', dedupeKey: 'fail-once', payload: { fail: true } });
  for (let i = 0; i < 3; i++) { await runOnce(pool, { limit: 1 }); await new Promise((r) => setTimeout(r, 3500)); }
  const failed = (await pool.query('SELECT status, attempts FROM p04.jobs WHERE id = $1', [failId])).rows[0];
  assert.deepEqual(failed, { status: 'failed', attempts: 3 });

  const crashId = await enqueue(pool, { tenantId: 1, kind: 'followup.reminder', dedupeKey: 'crash-recover', payload: {} });
  await pool.query("UPDATE p04.jobs SET status='running', locked_at=now() - interval '1 minute' WHERE id = $1", [crashId]);
  const recovered = await recoverStale(pool, 10);
  assert.equal(recovered, 1);
  await runOnce(pool, { limit: 1 });
  const crash = (await pool.query('SELECT status FROM p04.jobs WHERE id = $1', [crashId])).rows[0];
  assert.equal(crash.status, 'done');

  console.log(`jobs=200 done=${counts.done} results=${counts.results} duplicates=${counts.results - 200}`);
  console.log(`drain_ms=${elapsed} jobs_per_sec=${(200 / (elapsed / 1000)).toFixed(1)}`);
  console.log(`failure_status=${failed.status} attempts=${failed.attempts} recovered=${recovered} crash_status=${crash.status}`);
  console.log('JOBS PASS');
} catch (error) {
  console.error('JOBS FAIL:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
