import { TaskPool, PoolError, POOL_CODES } from '../src/pool.mjs';
import { check, eq, banner, summary, within } from './tapmini.mjs';
import { gate, sleep, waitUntil } from '../src/measure.mjs';

banner('E02 / 回归：空池等位、关闭、failFast 真值性、清理、参数矩阵');

const settle = (p) => p.catch((error) => error);

function fakeSignal() {
  const listeners = new Set();
  return {
    aborted: false,
    reason: undefined,
    addEventListener(type, fn) {
      if (type === 'abort') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'abort') listeners.delete(fn);
    },
    abort(reason) {
      this.aborted = true;
      this.reason = reason;
      const snapshot = [...listeners];
      listeners.clear();
      for (const fn of snapshot) fn();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

// ---------- 1. maxQueue=0：空池 waitForSlot 不能永久 pending ----------
{
  const pool = new TaskPool({ concurrency: 1, maxQueue: 0, name: 'empty-zero' });
  const result = await within(100, () => pool.waitForSlot().then(() => 'resolved'), '空池 waitForSlot').catch(
    (error) => error,
  );
  eq('maxQueue=0 空池 waitForSlot 立即返回', result, 'resolved');
}

// ---------- 2. maxQueue=0：忙碌时等位，槽位释放后返回 ----------
{
  const pool = new TaskPool({ concurrency: 1, maxQueue: 0, name: 'busy-zero' });
  const g = gate('g');
  const running = settle(pool.submit(() => g.promise, { label: 'running' }));
  await waitUntil(() => pool.stats().running === 1, { label: '任务已启动' });

  let resolved = false;
  const waiting = pool.waitForSlot().then(() => {
    resolved = true;
  });
  await sleep(30);
  eq('maxQueue=0 忙碌时 waitForSlot 未提前返回', resolved, false);

  g.open();
  const waited = await within(500, () => waiting, '槽位释放后 waitForSlot').catch((error) => error);
  eq('maxQueue=0 槽位释放后 waitForSlot 返回', waited, undefined);
  eq('maxQueue=0 waitForSlot 已结算', resolved, true);
  await within(500, () => running, '运行任务结算');
}

// ---------- 3. close({dropQueued:false}) 不得留下永远不执行的队列 ----------
{
  const pool = new TaskPool({ concurrency: 1, name: 'close-option' });
  const g = gate('g');
  const running = settle(pool.submit(() => g.promise, { label: 'running' }));
  await waitUntil(() => pool.stats().running === 1, { label: '任务已启动' });
  const queued = settle(pool.submit(() => 'should-not-run', { label: 'queued' }));
  await waitUntil(() => pool.stats().queued === 1, { label: '任务已入队' });

  pool.close({ dropQueued: false });
  const queuedResult = await within(100, () => queued).catch((error) => error);
  check(
    'close 忽略 dropQueued:false，排队任务被结算而不是永久挂起',
    queuedResult instanceof PoolError && queuedResult.code === POOL_CODES.CLOSED,
  );
  eq('close 后队列为空', pool.stats().queued, 0);

  g.open();
  await within(500, () => running, '运行中的任务跑完');
  await within(500, () => pool.drain(), '关闭后 drain');
}

// ---------- 4. failFast 对假值异常同样生效 ----------
for (const value of [null, undefined, 0, false, '']) {
  const pool = new TaskPool({ concurrency: 1, failFast: true, name: `failfast-${String(value)}` });
  const first = settle(pool.submit(() => { throw value; }, { label: 'boom' }));
  const rejectedWith = await within(200, () => first, '首错结算').catch((error) => error);
  check(`failFast 首错保留原值 ${String(value)}`, Object.is(rejectedWith, value));

  const second = await within(200, () => settle(pool.submit(() => 'should-not-run', { label: 'late' }))).catch(
    (error) => error,
  );
  check(
    `failFast 假值首错后仍拒绝新任务 ${String(value)}`,
    second instanceof PoolError && second.code === POOL_CODES.DISCARDED,
  );
  eq(`failFast 触发标记 ${String(value)}`, pool.stats().failFastTriggered, true);
}

// ---------- 5. cancelAll 清理 abort 监听器 ----------
{
  const pool = new TaskPool({ concurrency: 1, name: 'listeners' });
  const runSignal = fakeSignal();
  const queuedSignal = fakeSignal();
  const g = gate('g');
  const running = settle(pool.submit(() => g.promise, { signal: runSignal, label: 'running' }));
  await waitUntil(() => pool.stats().running === 1, { label: '任务已启动' });
  const queued = settle(pool.submit(() => 'q', { signal: queuedSignal, label: 'queued' }));
  await waitUntil(() => pool.stats().queued === 1, { label: '任务已入队' });

  pool.cancelAll('regression');
  eq('cancelAll 后排队任务监听器为 0', queuedSignal.listenerCount, 0);
  eq('cancelAll 后执行中任务监听器为 0', runSignal.listenerCount, 0);

  g.open();
  await within(500, () => running, '底层任务跑完');
  await within(500, () => queued, '排队任务已结算');
  await within(500, () => pool.drain(), 'drain');
}

// ---------- 6. drain 超时后注销 waiter ----------
{
  const pool = new TaskPool({ concurrency: 1, name: 'drain-timeout' });
  const g = gate('g');
  const running = settle(pool.submit(() => g.promise, { label: 'running' }));
  await waitUntil(() => pool.stats().running === 1, { label: '任务已启动' });

  const timedOut = await within(200, () => pool.drain({ timeoutMs: 20 })).catch((error) => error);
  check(
    'drain 超时返回 PoolError TIMEOUT',
    timedOut instanceof PoolError && timedOut.code === POOL_CODES.TIMEOUT,
  );
  eq('drain 超时后 idle waiter 注销', pool.stats().idleWaiters, 0);

  g.open();
  await within(500, () => running, '运行任务结算');
  await within(500, () => pool.drain(), '清理后 drain 成功');
  eq('drain 成功后仍无残留 waiter', pool.stats().idleWaiters, 0);
}

// ---------- 7. timeoutMs 参数矩阵 ----------
{
  const pool = new TaskPool({ concurrency: 1, name: 'timeout-matrix' });
  for (const [value, label] of [
    [NaN, 'NaN'],
    [-1, '-1'],
    [Infinity, 'Infinity'],
    ['100', 'string'],
    [{}, 'object'],
  ]) {
    let error = null;
    try {
      pool.submit(() => 'x', { timeoutMs: value });
    } catch (caught) {
      error = caught;
    }
    check(`非法 timeoutMs ${label} 抛 RangeError`, error instanceof RangeError);
  }
  const ok = await within(200, () => pool.submit(() => 'ok', { timeoutMs: 0 })).catch((error) => error);
  eq('timeoutMs=0 合法且可结算', ok, 'ok');
  const zero = await within(200, () => pool.submit(() => 'ok', { timeoutMs: null })).catch((error) => error);
  eq('timeoutMs=null 合法且可结算', zero, 'ok');
  await pool.drain();
}

// ---------- 8. 取消与超时交错：不重复结算、监听器清理 ----------
{
  const pool = new TaskPool({ concurrency: 1, name: 'cancel-timeout' });
  const signal = fakeSignal();
  const task = settle(pool.submit(() => sleep(60), { timeoutMs: 10, signal, label: 'slow' }));
  const timeoutError = await within(300, () => task, '超时结算').catch((error) => error);
  check(
    '超时返回 PoolError TIMEOUT',
    timeoutError instanceof PoolError && timeoutError.code === POOL_CODES.TIMEOUT,
  );

  pool.cancelAll('after-timeout');
  eq('超时后 cancelAll 清理监听器', signal.listenerCount, 0);
  await within(500, () => pool.drain(), '底层完成后 drain');
  eq('超时后底层完成计入 lateAfterTimeout', pool.stats().lateAfterTimeout, 1);
}

await sleep(20);
summary('test_regressions');