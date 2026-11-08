export async function enqueue(pool, { tenantId, kind, dedupeKey, payload = {}, runAt = null }) {
  const result = await pool.query(
    `INSERT INTO p04.jobs (tenant_id, kind, dedupe_key, payload, run_at)
     VALUES ($1, $2, $3, $4::jsonb, COALESCE($5, now()))
     ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
     RETURNING id`,
    [tenantId, kind, dedupeKey, JSON.stringify(payload), runAt],
  );
  return result.rows[0]?.id ?? null;
}

export async function recoverStale(pool, staleSeconds = 10) {
  const result = await pool.query(
    `UPDATE p04.jobs SET status = 'pending', locked_at = NULL, last_error = 'stale_recovered', updated_at = now()
     WHERE status = 'running' AND locked_at < now() - ($1 || ' seconds')::interval`,
    [String(staleSeconds)],
  );
  return result.rowCount;
}

async function processJob(client, job) {
  if (job.payload?.fail) throw new Error('forced_failure');
  await client.query(
    'INSERT INTO p04.job_results (job_id, result) VALUES ($1, $2) ON CONFLICT (job_id) DO NOTHING',
    [job.id, `reminder:${job.payload?.clientId ?? 'none'}`],
  );
}

export async function runOnce(pool, { limit = 10, maxAttempts = 3 } = {}) {
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const picked = await client.query(
        `SELECT * FROM p04.jobs
         WHERE status = 'pending' AND run_at <= now()
         ORDER BY run_at, id
         FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      if (picked.rowCount === 0) { await client.query('COMMIT'); break; }
      const job = picked.rows[0];
      const attempts = job.attempts + 1;
      await client.query(
        "UPDATE p04.jobs SET status = 'running', attempts = $2, locked_at = now(), updated_at = now() WHERE id = $1",
        [job.id, attempts],
      );
      try {
        await processJob(client, job);
        await client.query("UPDATE p04.jobs SET status = 'done', locked_at = NULL, updated_at = now() WHERE id = $1", [job.id]);
        await client.query('COMMIT');
        processed++;
      } catch (error) {
        const terminal = attempts >= maxAttempts;
        await client.query(
          `UPDATE p04.jobs SET status = $2, locked_at = NULL, last_error = $3,
             run_at = CASE WHEN $2 = 'pending' THEN now() + ($4 || ' seconds')::interval ELSE run_at END,
             updated_at = now()
           WHERE id = $1`,
          [job.id, terminal ? 'failed' : 'pending', String(error.message), String(attempts)],
        );
        await client.query('COMMIT');
        if (terminal) failed++;
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return { processed, failed };
}

export async function drain(pool, { workers = 4, maxRounds = 200 } = {}) {
  let processed = 0;
  for (let round = 0; round < maxRounds; round++) {
    const results = await Promise.all(Array.from({ length: workers }, () => runOnce(pool, { limit: 5 })));
    const done = results.reduce((sum, r) => sum + r.processed + r.failed, 0);
    processed += results.reduce((sum, r) => sum + r.processed, 0);
    if (done === 0) break;
  }
  return processed;
}
