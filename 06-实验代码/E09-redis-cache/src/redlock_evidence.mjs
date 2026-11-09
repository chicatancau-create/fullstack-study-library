import { startCluster, PORTS } from './cluster.mjs';
import { Redlock } from './redlock.mjs';
import { command } from './redis.mjs';
import {
  pgConnect, resetFencing, readOrder, writeWithFencing, writeWithoutFencing, handleIdempotent,
} from './fencing.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

const cluster = await startCluster(PORTS);
const rl = new Redlock(PORTS);
const db = await pgConnect();

try {
  await resetFencing(db);
  console.log(`redis: ${cluster.version}`);
  console.log(`instances: ${PORTS.join(',')} quorum=${rl.quorum} started=${cluster.started.join(',') || 'none'}`);

  // 1. 互斥、owner token、误删他人锁
  const key1 = 'e09:lock:order-1';
  for (const port of PORTS) await command(port, 'DEL', key1);
  const lockA = await rl.acquire(key1, 2000);
  const holdersA = await rl.holders(key1);
  const lockB = await rl.acquire(key1, 2000);
  const wrongRelease = await rl.release({ key: key1, token: 'wrong-owner' });
  const stillHeld = await rl.holders(key1);
  check(lockA !== null && lockA.okCount === 3, `acquire: okCount=${lockA?.okCount} validity=${lockA?.validity}ms`);
  check(holdersA.every((value) => value === lockA.token), 'all instances hold the same owner token');
  check(lockB === null, 'competing client is rejected while lock held');
  check(
    wrongRelease === 0 && stillHeld.every((value) => value === lockA.token),
    `wrong-owner release deletes 0 keys, lock intact`,
  );
  check((await rl.release(lockA)) === 3, 'owner release removes lock from all instances');

  // 2. quorum 丢失：3 个实例里只有 1 个可用，2/3 quorum 无法满足
  const key2 = 'e09:lock:quorum';
  for (const port of PORTS) await command(port, 'DEL', key2);
  const degraded = new Redlock([PORTS[0], 7998, 7999], 2);
  const degradedLock = await degraded.acquire(key2, 1000);
  const oneAlive = new Redlock([PORTS[0], 7998, 7999], 2);
  const oneLock = await oneAlive.acquire(key2, 1000);
  const twoOfTwo = new Redlock([PORTS[0], 7002], 2);
  const twoLock = await twoOfTwo.acquire(key2, 1000);
  check(degradedLock === null && oneLock === null, 'quorum lost: acquire fails (1/3 and 1/2 alive)');
  check(twoLock !== null && twoLock.okCount === 2, `quorum kept: 2/2 alive -> ${twoLock?.okCount}`);
  if (twoLock) await twoOfTwo.release(twoLock);

  // 3. 续租：TTL 覆盖任务时长
  const key3 = 'e09:lock:renew';
  for (const port of PORTS) await command(port, 'DEL', key3);
  const lockC = await rl.acquire(key3, 600);
  await sleep(300);
  const extended = await rl.extend(lockC, 1200);
  const ttlLeft = Number(await command(PORTS[0], 'PTTL', key3));
  check(extended !== null && ttlLeft > 600, `extend keeps ownership: pttl=${ttlLeft}ms validity=${extended?.validity}ms`);
  await rl.release(extended ?? lockC);

  // 4. 锁过期后 stale 写：无 fencing 覆盖新值；有 fencing 被拒
  await resetFencing(db);
  const key4 = 'e09:lock:stale';
  for (const port of PORTS) await command(port, 'DEL', key4);
  const oldLock = await rl.acquire(key4, 300);
  const fencingOld = 1;
  await sleep(450); // 模拟进程暂停：锁已过期，旧任务仍在运行
  const newLock = await rl.acquire(key4, 2000);
  const fencingNew = 2;
  check(
    oldLock !== null && newLock !== null && oldLock.token !== newLock.token,
    `expiry: old token=${oldLock?.token.slice(0, 8)} new token=${newLock?.token.slice(0, 8)}`,
  );
  await writeWithoutFencing(db, 'newer-write');
  await writeWithoutFencing(db, 'stale-write');
  const lostUpdate = await readOrder(db);
  check(lostUpdate.status === 'stale-write', `without fencing: stale writer overwrites -> ${lostUpdate.status}`);

  await resetFencing(db);
  await writeWithFencing(db, 'newer-write', fencingNew);
  const acceptedStale = await writeWithFencing(db, 'stale-write', fencingOld);
  const guarded = await readOrder(db);
  check(
    acceptedStale === false && guarded.status === 'newer-write' && Number(guarded.fencing) === fencingNew,
    `with fencing: stale token ${fencingOld} rejected, status=${guarded.status} fencing=${guarded.fencing}`,
  );
  await rl.release(newLock);

  // 5. 幂等：重复请求复用响应，同 key 不同 body 冲突
  await resetFencing(db);
  let handled = 0;
  const handler = (body) => {
    handled += 1;
    return { order: 'created', body };
  };
  const first = await handleIdempotent(db, 'req-1', '{"amount":10}', handler);
  const duplicate = await handleIdempotent(db, 'req-1', '{"amount":10}', handler);
  const conflict = await handleIdempotent(db, 'req-1', '{"amount":99}', handler);
  check(
    first.outcome === 'created' && duplicate.outcome === 'duplicate' && handled === 1,
    `idempotent: outcomes=${first.outcome}/${duplicate.outcome}, handler calls=${handled}`,
  );
  check(conflict.outcome === 'conflict', `same key different body: ${conflict.outcome}`);
  check(
    JSON.stringify(first.response) === JSON.stringify(duplicate.response),
    'duplicate request returns the stored response',
  );

  console.log(failures === 0 ? 'REDLOCK PASS' : 'REDLOCK FAIL');
  if (failures > 0) process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
  await cluster.stop();
}
