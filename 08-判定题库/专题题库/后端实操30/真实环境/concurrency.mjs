import pg from 'pg';
import fs from 'node:fs';

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('需要 PGPASSWORD（只从环境变量读取）');
  process.exit(2);
}

const config = () => ({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password,
  database: process.env.PGDATABASE || 'study_lab',
});

const results = [];
const evidence = { captured_at: new Date().toISOString(), checks: [] };
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  evidence.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const owner = new pg.Client(config());
const rival = new pg.Client(config());
await owner.connect();
await rival.connect();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  await owner.query('DROP SCHEMA IF EXISTS backend30_real CASCADE');
  await owner.query('CREATE SCHEMA backend30_real');
  await owner.query(`
    CREATE TABLE backend30_real.tasks (
      id int PRIMARY KEY,
      owner_id text NOT NULL,
      status text NOT NULL CHECK (status IN ('open', 'in_progress', 'done')),
      version int NOT NULL DEFAULT 1,
      expires_at timestamptz,
      lease_owner text
    )
  `);
  await owner.query(`
    CREATE UNIQUE INDEX tasks_one_in_progress
    ON backend30_real.tasks (owner_id)
    WHERE status = 'in_progress'
  `);
  await owner.query(`
    INSERT INTO backend30_real.tasks (id, owner_id, status, version, expires_at)
    VALUES (1, 'alice', 'open', 1, now() - interval '1 hour'),
           (2, 'alice', 'open', 1, now() + interval '1 hour'),
           (3, 'bob', 'open', 1, now() + interval '1 hour')
  `);
}

try {
  await setup();

  // C01 乐观锁：旧版本更新影响 0 行，新版本成功并递增
  const seen = (await owner.query('SELECT version FROM backend30_real.tasks WHERE id = 2')).rows[0].version;
  await rival.query('UPDATE backend30_real.tasks SET status = $1, version = version + 1 WHERE id = 2', ['done']);
  const stale = await owner.query('UPDATE backend30_real.tasks SET status = $1, version = version + 1 WHERE id = 2 AND version = $2', ['in_progress', seen]);
  const fresh = await owner.query('UPDATE backend30_real.tasks SET status = $1, version = version + 1 WHERE id = 2 AND version = $2', ['in_progress', seen + 1]);
  const after = (await owner.query('SELECT version, status FROM backend30_real.tasks WHERE id = 2')).rows[0];
  check('C01 乐观锁：旧版本 0 行、新版本成功且版本递增', stale.rowCount === 0 && fresh.rowCount === 1 && after.version === seen + 2, `stale=${stale.rowCount} fresh=${fresh.rowCount} version=${after.version}`);

  // C02 冲突自动重试：一次冲突后重读成功；连续冲突耗尽返回失败
  async function updateWithRetry(id, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const row = (await owner.query('SELECT version FROM backend30_real.tasks WHERE id = $1', [id])).rows[0];
      if (attempt === 1) {
        await rival.query('UPDATE backend30_real.tasks SET version = version + 1 WHERE id = $1', [id]);
      }
      const res = await owner.query(
        'UPDATE backend30_real.tasks SET status = $1, version = version + 1 WHERE id = $2 AND version = $3',
        ['done', id, row.version],
      );
      if (res.rowCount === 1) return { ok: true, attempts: attempt };
    }
    return { ok: false, attempts: maxAttempts };
  }
  const retried = await updateWithRetry(1);
  await owner.query("UPDATE backend30_real.tasks SET status = 'open' WHERE id = 1");
  async function alwaysConflict(id) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const row = (await owner.query('SELECT version FROM backend30_real.tasks WHERE id = $1', [id])).rows[0];
      await rival.query('UPDATE backend30_real.tasks SET version = version + 1 WHERE id = $1', [id]);
      const res = await owner.query(
        'UPDATE backend30_real.tasks SET status = $1, version = version + 1 WHERE id = $2 AND version = $3',
        ['done', id, row.version],
      );
      if (res.rowCount === 1) return { ok: true, attempts: attempt };
    }
    return { ok: false, attempts: 3 };
  }
  const exhausted = await alwaysConflict(1);
  check('C02 冲突重试：第二次成功；持续冲突 3 次后失败', retried.ok && retried.attempts === 2 && exhausted.ok === false, `retried=${JSON.stringify(retried)} exhausted=${JSON.stringify(exhausted)}`);

  // C03 同 Owner 仅一个进行中：部分唯一索引拦截
  const first = await owner.query("UPDATE backend30_real.tasks SET status = 'in_progress' WHERE id = 2 RETURNING id");
  let uniqueError = null;
  try {
    await owner.query("UPDATE backend30_real.tasks SET status = 'in_progress' WHERE id = 1");
  } catch (error) {
    uniqueError = error;
  }
  await owner.query("UPDATE backend30_real.tasks SET status = 'done' WHERE id = 2");
  const second = await owner.query("UPDATE backend30_real.tasks SET status = 'in_progress' WHERE id = 1 RETURNING id");
  check('C03 进行中任务唯一：冲突 23505，完成后可再占用', first.rowCount === 1 && uniqueError?.code === '23505' && second.rowCount === 1, `first=${first.rowCount} error=${uniqueError?.code ?? 'none'} second=${second.rowCount}`);

  // C04 互斥锁：advisory xact lock 阻塞，超时 55P03，释放后成功
  await owner.query('BEGIN');
  await owner.query('SELECT pg_advisory_xact_lock(3030)');
  await rival.query("SET lock_timeout = '200ms'");
  let lockError = null;
  try {
    await rival.query('BEGIN');
    await rival.query('SELECT pg_advisory_xact_lock(3030)');
  } catch (error) {
    lockError = error;
    await rival.query('ROLLBACK').catch(() => {});
  }
  await owner.query('COMMIT');
  let lockAfter = null;
  try {
    await rival.query('BEGIN');
    await rival.query('SELECT pg_advisory_xact_lock(3030)');
    await rival.query('COMMIT');
    lockAfter = 'ok';
  } catch (error) {
    lockAfter = error.code;
    await rival.query('ROLLBACK').catch(() => {});
  }
  check('C04 互斥锁：持锁期间 55P03，释放后可获取', lockError?.code === '55P03' && lockAfter === 'ok', `blocked=${lockError?.code ?? 'none'} after=${lockAfter}`);

  // C05 过期判断：过期记录不可认领，续期后可认领
  await owner.query("UPDATE backend30_real.tasks SET status = 'open', lease_owner = NULL WHERE id = 1");
  const expiredClaim = await owner.query(
    "UPDATE backend30_real.tasks SET status = 'in_progress', lease_owner = 'alice' WHERE id = 1 AND expires_at > now() AND status = 'open'",
  );
  await owner.query("UPDATE backend30_real.tasks SET expires_at = now() + interval '10 minutes', status = 'open' WHERE id = 1");
  const liveClaim = await owner.query(
    "UPDATE backend30_real.tasks SET status = 'in_progress', lease_owner = 'alice' WHERE id = 1 AND expires_at > now() AND status = 'open'",
  );
  check('C05 过期判断：过期 0 行、续期后认领成功', expiredClaim.rowCount === 0 && liveClaim.rowCount === 1, `expired=${expiredClaim.rowCount} live=${liveClaim.rowCount}`);

  // C06 按 Key 串行：同 key 阻塞、异 key 并行、释放后成功
  const keyLock = "SELECT pg_advisory_xact_lock(hashtext($1))";
  await owner.query('BEGIN');
  await owner.query(keyLock, ['task:1']);
  await rival.query("SET lock_timeout = '200ms'");
  let sameKeyError = null;
  try {
    await rival.query('BEGIN');
    await rival.query(keyLock, ['task:1']);
  } catch (error) {
    sameKeyError = error;
    await rival.query('ROLLBACK').catch(() => {});
  }
  let otherKey = null;
  try {
    await rival.query('BEGIN');
    await rival.query(keyLock, ['task:2']);
    await rival.query('COMMIT');
    otherKey = 'ok';
  } catch (error) {
    otherKey = error.code;
    await rival.query('ROLLBACK').catch(() => {});
  }
  await owner.query('COMMIT');
  let sameKeyAfter = null;
  try {
    await rival.query('BEGIN');
    await rival.query(keyLock, ['task:1']);
    await rival.query('COMMIT');
    sameKeyAfter = 'ok';
  } catch (error) {
    sameKeyAfter = error.code;
    await rival.query('ROLLBACK').catch(() => {});
  }
  await sleep(20);
  check('C06 按 Key 串行：同 key 阻塞、异 key 不阻塞、释放后成功', sameKeyError?.code === '55P03' && otherKey === 'ok' && sameKeyAfter === 'ok', `same=${sameKeyError?.code ?? 'none'} other=${otherKey} after=${sameKeyAfter}`);

  evidence.final = {
    rows: (await owner.query('SELECT count(*)::int AS n FROM backend30_real.tasks')).rows[0].n,
    in_progress: (await owner.query("SELECT count(*)::int AS n FROM backend30_real.tasks WHERE status = 'in_progress'")).rows[0].n,
  };
  check('最终不变量：同 Owner 至多一个进行中', evidence.final.in_progress <= 1, `in_progress=${evidence.final.in_progress}`);
} finally {
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/concurrency.json', JSON.stringify(evidence, null, 2) + '\n');
  await owner.end().catch(() => {});
  await rival.end().catch(() => {});
}

const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `BACKEND30-C PASS ${results.length}/${results.length}` : `BACKEND30-C FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
