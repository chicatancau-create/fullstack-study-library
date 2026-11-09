import { connect } from './db.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const main = await connect();
const holder = await connect();
const alter = await connect();
const writer = await connect();
const observer = await connect();
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

try {
  await main.query('DROP SCHEMA IF EXISTS e08t CASCADE');
  await main.query('CREATE SCHEMA e08t');
  await main.query('CREATE TABLE e08t.metrics (id serial PRIMARY KEY, value integer NOT NULL)');
  await main.query('INSERT INTO e08t.metrics (value) SELECT g FROM generate_series(1, 50000) AS g');

  // 场景一：改类型需要 ACCESS EXCLUSIVE；持锁事务期间观察排队，释放后完成。读写不中断。
  await holder.query('BEGIN');
  await holder.query('UPDATE e08t.metrics SET value = value + 1 WHERE id = 1');

  let stopWriter = false;
  const stats = { attempts: 0, ok: 0, failed: 0, maxStallMs: 0 };
  const writerLoop = (async () => {
    while (!stopWriter) {
      const started = performance.now();
      stats.attempts += 1;
      try {
        await writer.query('UPDATE e08t.metrics SET value = value + 1 WHERE id = $1', [
          1 + (stats.attempts % 50000),
        ]);
        stats.ok += 1;
      } catch {
        stats.failed += 1;
      }
      stats.maxStallMs = Math.max(stats.maxStallMs, Number((performance.now() - started).toFixed(1)));
      await sleep(10);
    }
  })();

  const alterStarted = performance.now();
  const alterPid = (await alter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const alterPromise = alter
    .query(`BEGIN; SET LOCAL lock_timeout='5000ms';
      ALTER TABLE e08t.metrics ALTER COLUMN value TYPE bigint USING value::bigint; COMMIT;`)
    .then(() => 'OK')
    .catch((error) => error.code || error.message);

  let waitRow = null;
  for (let i = 0; i < 25 && !waitRow; i += 1) {
    await sleep(100);
    const res = await observer.query(
      `SELECT l.mode, a.wait_event_type, a.wait_event
       FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
       WHERE a.pid = $1 AND l.relation = 'e08t.metrics'::regclass AND NOT l.granted`,
      [alterPid],
    );
    if (res.rowCount) waitRow = res.rows[0];
  }
  await holder.query('COMMIT');
  const alterResult = await alterPromise;
  const alterMs = Number((performance.now() - alterStarted).toFixed(0));
  await sleep(150);
  stopWriter = true;
  await writerLoop;

  check(
    waitRow !== null,
    `lock wait observed: mode=${waitRow?.mode ?? 'none'} wait=${waitRow?.wait_event_type ?? '-'}/${waitRow?.wait_event ?? '-'}`,
  );
  check(alterResult === 'OK', `type change completes after lock release in ${alterMs}ms`);
  const typeRow = await main.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema='e08t' AND table_name='metrics' AND column_name='value'`,
  );
  const rows = await main.query('SELECT count(*)::int AS n FROM e08t.metrics');
  check(
    typeRow.rows[0]?.data_type === 'bigint' && rows.rows[0].n === 50000,
    `type=bigint rows=${rows.rows[0].n}`,
  );
  check(
    stats.failed === 0 && stats.maxStallMs >= 100,
    `concurrent writes: attempts=${stats.attempts} ok=${stats.ok} failed=${stats.failed} maxStall=${stats.maxStallMs}ms`,
  );

  // 场景二：持锁不放 + 短 lock_timeout，改类型以 55P03 失败而不是无限等待。
  await holder.query('BEGIN');
  await holder.query('UPDATE e08t.metrics SET value = value + 1 WHERE id = 2');
  let timeoutError = 'none';
  try {
    await alter.query(`BEGIN; SET LOCAL lock_timeout='200ms';
      ALTER TABLE e08t.metrics ALTER COLUMN value TYPE numeric(12,2) USING value::numeric; COMMIT;`);
  } catch (error) {
    timeoutError = error.code || error.message;
    await alter.query('ROLLBACK').catch(() => {});
  }
  await holder.query('COMMIT');
  check(timeoutError === '55P03', `lock_timeout aborts type change: ${timeoutError}`);

  console.log(failures === 0 ? 'TYPE PASS' : 'TYPE FAIL');
  if (failures > 0) process.exitCode = 1;
} finally {
  await Promise.allSettled([main.end(), holder.end(), alter.end(), writer.end(), observer.end()]);
}
