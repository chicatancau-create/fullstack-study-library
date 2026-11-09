import pg from 'pg';
import { config } from './db.mjs';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function client(isolation) {
  const c = new pg.Client(config);
  await c.connect();
  if (isolation) await c.query(`SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL ${isolation}`);
  return c;
}

// 40001 = serialization_failure；有界重试，业务错误不重试。
export async function retrySerializable(fn, { retries = 3 } = {}) {
  let attempt = 0;
  const failures = [];
  while (attempt < retries) {
    attempt += 1;
    try {
      return { value: await fn(attempt), attempts: attempt, failures };
    } catch (error) {
      if (error.code !== '40001') {
        error.retryFailures = failures;
        throw error;
      }
      failures.push({ attempt, code: error.code });
      await sleep(20 * attempt);
    }
  }
  const error = new Error(`serializable 重试 ${retries} 次仍失败`);
  error.failures = failures;
  throw error;
}

// 两个 Serializable 事务同时“读 2 再各删 1”，制造写偏差；提交时其中一个必须 40001。
export async function serializableWriteSkew() {
  const c1 = await client('SERIALIZABLE');
  const c2 = await client('SERIALIZABLE');
  const result = { firstCommit: null, secondCommit: null, secondError: null };
  try {
    await c1.query('BEGIN');
    await c2.query('BEGIN');
    const a = await c1.query('SELECT count(*)::int AS n FROM e07.on_call WHERE on_call');
    const b = await c2.query('SELECT count(*)::int AS n FROM e07.on_call WHERE on_call');
    result.reads = [a.rows[0].n, b.rows[0].n];
    await c1.query("UPDATE e07.on_call SET on_call = false WHERE name = 'alice'");
    await c2.query("UPDATE e07.on_call SET on_call = false WHERE name = 'bob'");
    await c1.query('COMMIT');
    result.firstCommit = 'ok';
    try {
      await c2.query('COMMIT');
      result.secondCommit = 'ok';
    } catch (error) {
      result.secondError = error.code;
      await c2.query('ROLLBACK').catch(() => {});
    }
  } finally {
    await c1.end().catch(() => {});
    await c2.end().catch(() => {});
  }
  return result;
}

// 反向锁顺序制造 40P01；等待期间用观察连接读 pg_locks 的未授予锁。
export async function deadlock({ reversed = true } = {}) {
  const c1 = await client();
  const c2 = await client();
  const observer = await client();
  const blocked = new Promise((resolve) => setTimeout(resolve, 250));
  const result = { errors: [], locks: [] };
  try {
    await c1.query('BEGIN');
    await c2.query('BEGIN');
    const first = reversed ? 'x' : 'x';
    const second = reversed ? 'y' : 'y';
    await c1.query('UPDATE e07.inventory SET qty = qty WHERE sku = $1', [first]);
    await c2.query('UPDATE e07.inventory SET qty = qty WHERE sku = $1', [reversed ? 'y' : 'x']);
    const p1 = c1.query('UPDATE e07.inventory SET qty = qty WHERE sku = $1', [second]).then(() => null, (error) => error.code);
    const p2 = c2.query('UPDATE e07.inventory SET qty = qty WHERE sku = $1', [reversed ? 'x' : 'y']).then(() => null, (error) => error.code);
    await blocked;
    const locks = await observer.query(
      `SELECT a.pid, a.state, a.wait_event_type, l.locktype, l.mode, l.granted, c.relname
         FROM pg_locks l
         JOIN pg_stat_activity a ON a.pid = l.pid
         LEFT JOIN pg_class c ON c.oid = l.relation
        WHERE a.datname = current_database() AND NOT l.granted
          AND (l.relation IS NULL OR c.relnamespace = 'e07'::regnamespace)`,
    );
    result.locks = locks.rows;
    result.errors = (await Promise.all([p1, p2])).filter(Boolean);
    await c1.query('ROLLBACK').catch(() => {});
    await c2.query('ROLLBACK').catch(() => {});
  } finally {
    await observer.end().catch(() => {});
    await c1.end().catch(() => {});
    await c2.end().catch(() => {});
  }
  return result;
}

export async function consistentOrder() {
  const c1 = await client();
  const c2 = await client();
  const result = { errors: [] };
  try {
    await c1.query('BEGIN');
    await c2.query('BEGIN');
    await c1.query("UPDATE e07.inventory SET qty = qty WHERE sku = 'x'");
    const c1y = c1.query("UPDATE e07.inventory SET qty = qty WHERE sku = 'y'").then(() => null, (error) => error.code);
    await c1y;
    // c2 按同一顺序等待 x；c1 提交后 c2 继续，不会互相等成环。
    const c2x = c2.query("UPDATE e07.inventory SET qty = qty WHERE sku = 'x'").then(() => null, (error) => error.code);
    await sleep(100);
    await c1.query('COMMIT');
    result.errors.push(await c2x);
    result.errors.push(await c2.query("UPDATE e07.inventory SET qty = qty WHERE sku = 'y'").then(() => null, (error) => error.code));
    await c2.query('COMMIT');
  } finally {
    await c1.end().catch(() => {});
    await c2.end().catch(() => {});
  }
  result.errors = result.errors.filter(Boolean);
  return result;
}

export async function lockTimeout() {
  const holder = await client();
  const waiter = await client();
  const result = { error: null, waitedMs: null };
  try {
    await holder.query('BEGIN');
    await holder.query("UPDATE e07.inventory SET qty = qty WHERE sku = 'x'");
    await waiter.query('BEGIN');
    await waiter.query("SET LOCAL lock_timeout = '200ms'");
    const started = Date.now();
    try {
      await waiter.query("UPDATE e07.inventory SET qty = qty WHERE sku = 'x'");
    } catch (error) {
      result.error = error.code;
      result.waitedMs = Date.now() - started;
    }
    await waiter.query('ROLLBACK').catch(() => {});
    await holder.query('COMMIT').catch(() => {});
  } finally {
    await holder.end().catch(() => {});
    await waiter.end().catch(() => {});
  }
  return result;
}

export async function poolBehaviour() {
  const pool = new pg.Pool({ ...config, max: 2, connectionTimeoutMillis: 300, idleTimeoutMillis: 5000 });
  const result = { acquired: 0, timeoutError: null, timeoutMs: null, afterRelease: null, stats: null };
  const c1 = await pool.connect();
  const c2 = await pool.connect();
  result.acquired = pool.totalCount;
  await c1.query('BEGIN');
  await c1.query('SELECT 1');
  const started = Date.now();
  try {
    await pool.connect();
  } catch (error) {
    result.timeoutError = error.message.includes('timeout') ? 'timeout' : error.message;
    result.timeoutMs = Date.now() - started;
  }
  // 长事务占着 1 个连接时，另一个连接仍可查询。
  const probe = await c2.query('SELECT 1 AS ok');
  result.afterRelease = probe.rows[0].ok;
  c1.release();
  c2.release();
  await sleep(50);
  result.stats = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
  await pool.end();
  return result;
}

export async function plans() {
  const c = await client();
  try {
    const owner = await c.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT count(*) FROM e07.members WHERE workspace_id = 1 AND role = 'owner'`,
    );
    const update = await c.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       UPDATE e07.inventory SET qty = qty WHERE sku = 'x'`,
    );
    return {
      owner: owner.rows.map((r) => r['QUERY PLAN']),
      update: update.rows.map((r) => r['QUERY PLAN']),
    };
  } finally {
    await c.end();
  }
}
