import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startCluster, PORTS } from '../src/cluster.mjs';
import { Redlock } from '../src/redlock.mjs';
import { command } from '../src/redis.mjs';
import {
  pgConnect, resetFencing, readOrder, writeWithFencing, writeWithoutFencing, handleIdempotent,
} from '../src/fencing.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let cluster;
let rl;
let db;

before(async () => {
  cluster = await startCluster(PORTS);
  rl = new Redlock(PORTS);
  db = await pgConnect();
  await resetFencing(db);
});

after(async () => {
  if (db) await db.end();
  if (cluster) await cluster.stop();
});

async function clean(key) {
  for (const port of PORTS) await command(port, 'DEL', key);
}

test('锁竞争：同 key 只有一个 owner，token 在 3 个实例一致', async () => {
  const key = 'e09:test:mutex';
  await clean(key);
  const lockA = await rl.acquire(key, 2000);
  const holders = await rl.holders(key);
  const lockB = await rl.acquire(key, 2000);
  assert.equal(lockA.okCount, 3);
  assert.ok(holders.every((value) => value === lockA.token));
  assert.equal(lockB, null);
  assert.equal(await rl.release(lockA), 3);
});

test('误删他人锁：错误 token 的释放返回 0，锁仍归原 owner', async () => {
  const key = 'e09:test:wrong-owner';
  await clean(key);
  const lock = await rl.acquire(key, 2000);
  assert.equal(await rl.release({ key, token: 'not-the-owner' }), 0);
  const holders = await rl.holders(key);
  assert.ok(holders.every((value) => value === lock.token));
  await rl.release(lock);
});

test('quorum 丢失：可用实例少于 2/3 时无法获取锁', async () => {
  const key = 'e09:test:quorum';
  await clean(key);
  const lost = new Redlock([PORTS[0], 7998, 7999], 2);
  assert.equal(await lost.acquire(key, 1000), null);
  const kept = new Redlock([PORTS[0], PORTS[1]], 2);
  const lock = await kept.acquire(key, 1000);
  assert.equal(lock.okCount, 2);
  await kept.release(lock);
});

test('锁过期反例：旧 owner 晚到写会覆盖；fencing token 拒绝 stale writer', async () => {
  const key = 'e09:test:stale';
  await clean(key);
  await resetFencing(db);
  const oldLock = await rl.acquire(key, 300);
  await sleep(450);
  const newLock = await rl.acquire(key, 2000);
  assert.notEqual(oldLock.token, newLock.token);

  await writeWithoutFencing(db, 'newer-write');
  await writeWithoutFencing(db, 'stale-write');
  assert.equal((await readOrder(db)).status, 'stale-write');

  await resetFencing(db);
  assert.equal(await writeWithFencing(db, 'newer-write', 2), true);
  assert.equal(await writeWithFencing(db, 'stale-write', 1), false);
  assert.deepEqual(await readOrder(db), { status: 'newer-write', fencing: '2' });
  await rl.release(newLock);
});

test('续租：extend 只延长 owner 自己的锁', async () => {
  const key = 'e09:test:renew';
  await clean(key);
  const lock = await rl.acquire(key, 600);
  await sleep(250);
  const extended = await rl.extend(lock, 1200);
  assert.ok(extended);
  assert.ok(Number(await command(PORTS[0], 'PTTL', key)) > 600);
  assert.equal(await rl.extend({ ...lock, token: 'other-owner' }, 1200), null);
  await rl.release(extended);
});

test('幂等：重复请求复用响应；同 key 不同 body 冲突', async () => {
  await resetFencing(db);
  let handled = 0;
  const handler = (body) => {
    handled += 1;
    return { created: true, body };
  };
  const first = await handleIdempotent(db, 'req-1', '{"amount":10}', handler);
  const duplicate = await handleIdempotent(db, 'req-1', '{"amount":10}', handler);
  const conflict = await handleIdempotent(db, 'req-1', '{"amount":99}', handler);
  assert.equal(first.outcome, 'created');
  assert.equal(duplicate.outcome, 'duplicate');
  assert.equal(conflict.outcome, 'conflict');
  assert.equal(handled, 1);
  assert.deepEqual(first.response, duplicate.response);
});
