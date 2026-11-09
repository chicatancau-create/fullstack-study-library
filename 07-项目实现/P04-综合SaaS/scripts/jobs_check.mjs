import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { processJobs } from '../src/jobs.mjs';

const pool = createPool(4);
try {
  await pool.query('TRUNCATE p04.users, p04.tenants, p04.jobs, p04.job_notifications, p04.worker_inbox, p04.job_dead_letter RESTART IDENTITY CASCADE');
  await pool.query("INSERT INTO p04.users (email, name, password_hash) VALUES ('jobs@example.com','jobs','x:y')");
  const tenantId = (await pool.query("INSERT INTO p04.tenants (name, plan, seat_limit) VALUES ('作业验证', 'team', 5) RETURNING id")).rows[0].id;
  for (let i = 1; i <= 200; i += 1) {
    await pool.query(
      `INSERT INTO p04.jobs (tenant_id, kind, dedupe_key, payload, run_at, priority)
       VALUES ($1,'reminder',$2,'{}'::jsonb, now() - interval '1 second', 5)`,
      [tenantId, `job-${i}`],
    );
  }
  for (let i = 0; i < 3; i += 1) {
    await pool.query(
      `INSERT INTO p04.jobs (tenant_id, kind, dedupe_key, payload, run_at, priority)
       VALUES ($1,'reminder',$2,'{}'::jsonb, now() - interval '1 second', 5)
       ON CONFLICT (tenant_id, dedupe_key) DO NOTHING`,
      [tenantId, 'job-1'],
    );
  }
  const started = performance.now();
  let processed = 0;
  for (;;) {
    const batch = await processJobs(pool, { limit: 20 });
    if (batch.length === 0) break;
    processed += batch.length;
  }
  const elapsed = Math.round(performance.now() - started);
  const counts = (await pool.query(`SELECT
    (SELECT count(*)::int FROM p04.jobs WHERE status='done') AS done,
    (SELECT count(*)::int FROM p04.jobs WHERE status='pending') AS pending,
    (SELECT count(*)::int FROM p04.job_notifications) AS notifications,
    (SELECT count(*)::int FROM p04.worker_inbox) AS inbox`)).rows[0];
  assert.equal(processed, 200);
  assert.equal(counts.done, 200);
  assert.equal(counts.pending, 0);
  assert.equal(counts.notifications, 200);
  assert.equal(counts.inbox, 200);

  await pool.query(
    `INSERT INTO p04.jobs (tenant_id, kind, dedupe_key, payload, run_at, priority)
     VALUES ($1,'boom','boom-once','{}'::jsonb, now() - interval '1 second', 0)`, [tenantId],
  );
  for (let i = 0; i < 5; i += 1) {
    await pool.query("UPDATE p04.jobs SET run_at = now() - interval '1 second' WHERE kind='boom'");
    await processJobs(pool, { failKinds: new Set(['boom']) });
  }
  const dead = (await pool.query("SELECT status, attempts FROM p04.jobs WHERE kind='boom'")).rows[0];
  assert.equal(dead.status, 'dead');
  assert.equal(dead.attempts, 5);
  const deadLetters = (await pool.query('SELECT count(*)::int AS n FROM p04.job_dead_letter')).rows[0].n;
  assert.equal(deadLetters, 1);

  const lines = [
    'P04 作业调度证据（真实 PostgreSQL）',
    `生成时间：${new Date().toISOString()}`,
    `200 个到期任务在 ${elapsed}ms 内处理完成，吞吐 ${(200 / (elapsed / 1000)).toFixed(1)} 任务/s`,
    `done=${counts.done} pending=${counts.pending} notifications=${counts.notifications} inbox=${counts.inbox}`,
    `重复入队 3 次未产生重复行（UNIQUE tenant_id+dedupe_key）`,
    `故障注入：status=${dead.status} attempts=${dead.attempts} 死信=${deadLetters}`,
  ];
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/jobs.txt', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
} finally {
  await pool.end();
}
