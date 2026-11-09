const MAX_ATTEMPTS = 5;

export async function processJobs(pool, { limit = 5, now = new Date(), failKinds = new Set() } = {}) {
  const client = await pool.connect();
  const processed = [];
  try {
    await client.query('BEGIN');
    const due = await client.query(
      `SELECT j.* FROM p04.jobs j
        WHERE j.status = 'pending' AND j.run_at <= $1
          AND j.id = (
            SELECT j2.id FROM p04.jobs j2
             WHERE j2.tenant_id = j.tenant_id AND j2.status = 'pending' AND j2.run_at <= $1
             ORDER BY j2.priority DESC, j2.run_at, j2.id LIMIT 1)
        ORDER BY j.priority DESC, j.run_at, j.id
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [now, limit],
    );
    for (const job of due.rows) {
      await client.query('SAVEPOINT job_sp');
      try {
        if (failKinds.has(job.kind)) throw new Error(`injected failure: ${job.kind}`);
        await client.query("UPDATE p04.jobs SET status='running', locked_at=now(), updated_at=now() WHERE id=$1", [job.id]);
        const message = job.kind === 'reminder'
          ? `跟进提醒：客户 #${job.payload.client_id}`
          : `任务 ${job.kind} 完成`;
        await client.query(
          `INSERT INTO p04.job_notifications (job_id, tenant_id, message) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`, [job.id, job.tenant_id, message],
        );
        await client.query(
          `INSERT INTO p04.worker_inbox (consumer, job_id) VALUES ('job-worker', $1)
           ON CONFLICT DO NOTHING`, [job.id],
        );
        if (job.kind === 'reminder') {
          await client.query("UPDATE p04.reminders SET status='sent' WHERE followup_id = $1 AND status='scheduled'", [job.payload.followup_id]);
        }
        await client.query(
          "UPDATE p04.jobs SET status='done', attempts=attempts+1, updated_at=now() WHERE id=$1", [job.id],
        );
        await client.query('RELEASE SAVEPOINT job_sp');
        processed.push({ id: job.id, tenant_id: job.tenant_id, status: 'done' });
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT job_sp');
        const attempts = job.attempts + 1;
        const dead = attempts >= MAX_ATTEMPTS;
        const backoffMs = Math.min(60000, 1000 * 2 ** attempts);
        await client.query(
          `UPDATE p04.jobs SET status=$2, attempts=$3, last_error=$4,
             run_at = now() + ($5 || ' milliseconds')::interval, updated_at=now() WHERE id=$1`,
          [job.id, dead ? 'dead' : 'pending', attempts, String(error.message).slice(0, 500), String(backoffMs)],
        );
        if (dead) {
          await client.query(
            `INSERT INTO p04.job_dead_letter (job_id, tenant_id, payload, last_error, attempts)
             VALUES ($1,$2,$3::jsonb,$4,$5) ON CONFLICT (job_id) DO NOTHING`,
            [job.id, job.tenant_id, JSON.stringify(job.payload), String(error.message).slice(0, 500), attempts],
          );
        }
        await client.query('RELEASE SAVEPOINT job_sp');
        processed.push({ id: job.id, tenant_id: job.tenant_id, status: dead ? 'dead' : 'retry', error: error.message });
      }
    }
    await client.query('COMMIT');
    return processed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function capacityEstimate({ remindersPerDay = 10000, peakFactor = 3, msPerJob = 20, workerConcurrency = 4, workers = 1 } = {}) {
  const normalRps = remindersPerDay / 86400;
  const peakRps = normalRps * peakFactor;
  const capacityRps = (workers * workerConcurrency * 1000) / msPerJob;
  const utilization = peakRps / capacityRps;
  return {
    normal_rps: Number(normalRps.toFixed(4)),
    peak_rps: Number(peakRps.toFixed(4)),
    capacity_rps: Number(capacityRps.toFixed(2)),
    utilization: Number(utilization.toFixed(4)),
    tier: utilization <= 0.7 ? 'normal' : utilization <= 1 ? 'peak' : 'over',
    assumptions: { remindersPerDay, peakFactor, msPerJob, workerConcurrency, workers },
  };
}
