// E07 事务证据：Serializable 写偏差/重试、死锁与 pg_locks、lock_timeout、连接池、执行计划。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { reset } from '../src/db.mjs';
import { client, consistentOrder, deadlock, lockTimeout, plans, poolBehaviour, retrySerializable, serializableWriteSkew } from '../src/tx.mjs';

fs.mkdirSync('evidence', { recursive: true });
const header = (title) => [`# ${title}`, `captured_at: ${new Date().toISOString()}`, ''];

// 1) Serializable：写偏差与 40001
await reset();
const skew = await serializableWriteSkew();

// 确定性重放 40001：bob 的首次尝试在 COMMIT 前挂起，alice 先提交，bob 再提交必然冲突。
await reset();
let release;
const gate = new Promise((resolve) => { release = resolve; });
let firstAttempt = true;
const bob = retrySerializable(async () => {
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
    if (firstAttempt) {
      firstAttempt = false;
      await gate;
    }
    await c.query('COMMIT');
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await c.end();
  }
});
await new Promise((r) => setTimeout(r, 100));
const alice = await client('SERIALIZABLE');
await alice.query('BEGIN');
await alice.query('SELECT count(*)::int AS n FROM e07.on_call WHERE on_call');
await alice.query("UPDATE e07.on_call SET on_call = false WHERE name = 'alice'");
await alice.query('COMMIT');
await alice.end();
release();
let retryError = null;
try { await bob; } catch (error) { retryError = error; }
assert.ok(retryError, '重试后应当业务拒绝');
assert.deepEqual(retryError.retryFailures.map((f) => f.code), ['40001']);
fs.writeFileSync('evidence/serializable.txt', [
  ...header('Serializable：写偏差被 40001 拦截'),
  `第一次读计数: ${skew.reads.join(' / ')}`,
  `先提交: ${skew.firstCommit}`,
  `后提交: ${skew.secondError}`,
  `重试记录: ${retryError.retryFailures.map((f) => `第${f.attempt}次 ${f.code}`).join(', ')}`,
  `重试后的业务结论: ${retryError.message}`,
  '结论: 40001 必须重试；重试后按最新数据判断是否允许下线。',
  '',
].join('\n'));
assert.equal(skew.secondError, '40001');

// 2) 死锁与 pg_locks
await reset();
const dl = await deadlock({ reversed: true });
await assert.rejects(() => Promise.reject(Object.assign(new Error('deadlock'), { code: 'x' })), /deadlock/);
fs.writeFileSync('evidence/deadlock.txt', [
  ...header('死锁：反向锁顺序 + pg_locks 未授予锁'),
  `错误码: ${dl.errors.join(', ') || '(none)'}`,
  `未授予锁 ${dl.locks.length} 条:`,
  ...dl.locks.map((l) => `  pid=${l.pid} state=${l.state} wait=${l.wait_event_type} lock=${l.locktype}/${l.mode} rel=${l.relname ?? '-'}`),
  '',
].join('\n'));
assert.ok(dl.errors.includes('40P01'));
await reset();
const fixedOrder = await consistentOrder();
fs.appendFileSync('evidence/deadlock.txt', `统一顺序后错误: ${fixedOrder.errors.join(', ') || '(none)'}\n`);
assert.deepEqual(fixedOrder.errors, []);

// 3) lock_timeout
await reset();
const lt = await lockTimeout();
fs.writeFileSync('evidence/lock-timeout.txt', [
  ...header('lock_timeout：等待锁超时'),
  `error=${lt.error} waited=${lt.waitedMs}ms`,
  '',
].join('\n'));
assert.equal(lt.error, '55P03');

// 4) 连接池
const pool = await poolBehaviour();
fs.writeFileSync('evidence/pool.txt', [
  ...header('连接池：耗尽、获取超时、长事务与释放'),
  `max=2 已获取=${pool.acquired}`,
  `第 3 个获取: ${pool.timeoutError}（${pool.timeoutMs}ms）`,
  `长事务期间另一连接查询: ok=${pool.afterRelease}`,
  `释放后 stats: total=${pool.stats.total} idle=${pool.stats.idle} waiting=${pool.stats.waiting}`,
  '',
].join('\n'));
assert.equal(pool.timeoutError, 'timeout');
assert.deepEqual(pool.stats, { total: 2, idle: 2, waiting: 0 });

// 5) 执行计划
await reset();
const plan = await plans();
fs.writeFileSync('evidence/plans.txt', [
  ...header('EXPLAIN (ANALYZE, BUFFERS)：Owner 计数与库存更新'),
  '-- SELECT count(*) ... role = owner',
  ...plan.owner,
  '',
  "-- UPDATE inventory ... sku = 'x'",
  ...plan.update,
  '',
].join('\n'));
assert.ok(plan.owner.join('\n').includes('Execution Time'));

console.log('E07 事务证据：serializable / deadlock / lock-timeout / pool / plans 全部 PASS');
