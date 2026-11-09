import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { connect, reset } from '../src/db.mjs';
import {
  client,
  consistentOrder,
  deadlock,
  lockTimeout,
  plans,
  poolBehaviour,
  retrySerializable,
  serializableWriteSkew,
  sleep,
} from '../src/tx.mjs';

beforeEach(async () => {
  await reset();
});

test('Serializable：写偏差被 40001 拦截，有界重试后保留 1 个 on_call', async () => {
  const skew = await serializableWriteSkew();
  assert.deepEqual(skew.reads, [2, 2]);
  assert.equal(skew.firstCommit, 'ok');
  assert.equal(skew.secondError, '40001');
  await reset();
  // 确定性重放：先让 bob 的 Serializable 事务读到 2 并持有未提交更新，
  // 再让 alice 提交成功；bob 提交时必然 40001，重试后看到 1 并拒绝。
  const bob = await client('SERIALIZABLE');
  await bob.query('BEGIN');
  const seen = (await bob.query('SELECT count(*)::int AS n FROM e07.on_call WHERE on_call')).rows[0].n;
  assert.equal(seen, 2);
  await bob.query("UPDATE e07.on_call SET on_call = false WHERE name = 'bob'");

  const alice = await client('SERIALIZABLE');
  await alice.query('BEGIN');
  const aliceSees = (await alice.query('SELECT count(*)::int AS n FROM e07.on_call WHERE on_call')).rows[0].n;
  assert.equal(aliceSees, 2);
  await alice.query("UPDATE e07.on_call SET on_call = false WHERE name = 'alice'");
  await alice.query('COMMIT');
  await alice.end();

  let failure = null;
  try { await bob.query('COMMIT'); } catch (error) { failure = error; }
  assert.equal(failure?.code, '40001');
  await bob.query('ROLLBACK').catch(() => {});
  await bob.end();

  await assert.rejects(
    () => retrySerializable(async () => {
      const c = await client('SERIALIZABLE');
      try {
        await c.query('BEGIN');
        const n = (await c.query('SELECT count(*)::int AS n FROM e07.on_call WHERE on_call')).rows[0].n;
        if (n <= 1) {
          await c.query('ROLLBACK');
          const error = new Error('最后一名值守人员不能下线');
          error.code = 'BUSINESS';
          throw error;
        }
        await c.query("UPDATE e07.on_call SET on_call = false WHERE name = 'bob'");
        await c.query('COMMIT');
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        await c.end();
      }
    }, { retries: 3 }),
    (error) => {
      assert.match(error.message, /最后一名值守人员不能下线/);
      assert.equal(error.retryFailures.length, 0);
      return true;
    },
  );

  const finalClient = await connect();
  try {
    const after = await finalClient.query('SELECT count(*)::int AS n FROM e07.on_call WHERE on_call');
    assert.equal(after.rows[0].n, 1);
  } finally {
    await finalClient.end();
  }
});

test('死锁：反向锁顺序触发 40P01，且 pg_locks 能看到未授予锁', async () => {
  const result = await deadlock({ reversed: true });
  assert.ok(result.errors.includes('40P01'), `应出现 40P01，实际 ${result.errors.join(',')}`);
  assert.ok(result.locks.length >= 1, '阻塞窗口内应观测到未授予的锁');
  await sleep(50);

  const fixed = await consistentOrder();
  assert.deepEqual(fixed.errors, []);
});

test('lock_timeout：等待锁超时返回 55P03', async () => {
  const result = await lockTimeout();
  assert.equal(result.error, '55P03');
  assert.ok(result.waitedMs >= 150 && result.waitedMs < 3000, `等待时长应在 200ms 附近，实际 ${result.waitedMs}`);
});

test('连接池：max=2 时第 3 个获取超时，长事务不阻塞另一连接，释放后回收', async () => {
  const result = await poolBehaviour();
  assert.equal(result.acquired, 2);
  assert.equal(result.timeoutError, 'timeout');
  assert.ok(result.timeoutMs >= 250 && result.timeoutMs < 3000, `获取超时应在 300ms 附近，实际 ${result.timeoutMs}`);
  assert.equal(result.afterRelease, 1);
  assert.deepEqual(result.stats, { total: 2, idle: 2, waiting: 0 });
});

test('执行计划：EXPLAIN ANALYZE 输出可判读的计划与耗时', async () => {
  const plan = await plans();
  assert.ok(plan.owner.join('\n').includes('Execution Time'));
  assert.ok(plan.update.join('\n').includes('Execution Time'));
  assert.ok(plan.owner.join('\n').includes('Scan'));
});
