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
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

async function setup(c) {
  await c.query('DROP SCHEMA IF EXISTS sql50_real CASCADE');
  await c.query('CREATE SCHEMA sql50_real');
  await c.query('CREATE TABLE sql50_real.doctors (id int PRIMARY KEY, on_call boolean NOT NULL)');
  await c.query('INSERT INTO sql50_real.doctors VALUES (1, true), (2, true)');
}

const c1 = new pg.Client(config());
const c2 = new pg.Client(config());
await c1.connect();
await c2.connect();

try {
  await setup(c1);

  for (const [iso, label] of [['READ COMMITTED', 'RC'], ['REPEATABLE READ', 'RR']]) {
    await setup(c1);
    await c1.query(`BEGIN ISOLATION LEVEL ${iso}`);
    await c2.query(`BEGIN ISOLATION LEVEL ${iso}`);
    await c1.query('SELECT count(*) FROM sql50_real.doctors WHERE on_call');
    await c2.query('SELECT count(*) FROM sql50_real.doctors WHERE on_call');
    await c1.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 1');
    await c2.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 2');
    await c1.query('COMMIT');
    let commitError = null;
    try {
      await c2.query('COMMIT');
    } catch (error) {
      commitError = error;
      await c2.query('ROLLBACK').catch(() => {});
    }
    const onCall = (await c1.query('SELECT count(*)::int AS n FROM sql50_real.doctors WHERE on_call')).rows[0].n;
    const detail = `on_call=${onCall}${commitError ? ` commit_error=${commitError.code}` : ''}`;
    if (label === 'RC') check('RC 写偏差复现：两名值班同时被取消', onCall === 0 && !commitError, detail);
    else check('RR 写偏差仍存在：快照读不阻止交叉更新', onCall === 0 && !commitError, detail);
  }

  await setup(c1);
  await c1.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await c2.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await c1.query('SELECT count(*) FROM sql50_real.doctors WHERE on_call');
  await c2.query('SELECT count(*) FROM sql50_real.doctors WHERE on_call');
  await c1.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 1');
  await c2.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 2');
  await c1.query('COMMIT');
  let serialError = null;
  try {
    await c2.query('COMMIT');
  } catch (error) {
    serialError = error;
    await c2.query('ROLLBACK').catch(() => {});
  }
  check('Serializable 拒绝第二个提交（40001）', serialError?.code === '40001', serialError?.code || 'no-error');

  await setup(c1);
  await c1.query('BEGIN');
  await c2.query('BEGIN');
  await c1.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 1');
  await c2.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 2');
  const [r1, r2] = await Promise.allSettled([
    c1.query('UPDATE sql50_real.doctors SET on_call = true WHERE id = 2'),
    c2.query('UPDATE sql50_real.doctors SET on_call = true WHERE id = 1'),
  ]);
  const deadlockError = (r1.status === 'rejected' && r1.reason) || (r2.status === 'rejected' && r2.reason) || null;
  check('反向锁顺序触发死锁（40P01）', deadlockError?.code === '40P01', deadlockError?.code || 'no-error');
  await c1.query('ROLLBACK').catch(() => {});
  await c2.query('ROLLBACK').catch(() => {});

  await setup(c1);
  await c1.query('BEGIN');
  await c2.query('BEGIN');
  await c1.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 1');
  const blockedOnFirst = c2.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 1');
  await c1.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 2');
  await c1.query('COMMIT');
  await blockedOnFirst;
  await c2.query('UPDATE sql50_real.doctors SET on_call = false WHERE id = 2');
  await c2.query('COMMIT');
  check('统一锁顺序后同场景无死锁', true);

  await setup(c1);
  await c1.query('BEGIN');
  await c1.query('LOCK TABLE sql50_real.doctors IN ACCESS EXCLUSIVE MODE');
  await c2.query("SET lock_timeout = '200ms'");
  let lockError = null;
  try {
    await c2.query('SELECT * FROM sql50_real.doctors FOR UPDATE');
  } catch (error) {
    lockError = error;
  }
  check('lock_timeout 返回 55P03', lockError?.code === '55P03', lockError?.code || 'no-error');
  await c1.query('ROLLBACK').catch(() => {});
} finally {
  await c1.end();
  await c2.end();
}

const failures = results.filter((r) => !r.ok).length;
fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/concurrency.json', `${JSON.stringify(results, null, 2)}\n`);
console.log(`CONCURRENCY ${failures ? 'FAIL' : 'PASS'} ${results.length - failures}/${results.length}`);
process.exitCode = failures ? 1 : 0;
