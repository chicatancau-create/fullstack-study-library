import { TaskPool, PoolError, POOL_CODES } from '../src/pool.mjs';
import { check, eq, atMost, banner, summary, within } from './tapmini.mjs';
import { deferred, gate, sleep, waitUntil } from '../src/measure.mjs';

banner('E02 / 任务池基础语义');

const settleNoThrow = (p) => p.catch((error) => error);

// ---------- 1. 并发上限 ----------
{
  const pool = new TaskPool({ concurrency: 3, maxQueue: 20, name: 'cap' });
  let inFlight = 0;
  let peak = 0;
  const gates = Array.from({ length: 9 }, () => deferred());
  const tasks = gates.map((g, i) =>
    settleNoThrow(
      pool.submit(
        async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          try {
            await g.promise;
            return i;
          } finally {
            inFlight--;
          }
        },
        { label: `c${i}` },
      ),
    ),
  );

  await waitUntil(() => pool.stats().running === 3, { label: '前 3 个先启动' });
  eq('并发上限：同时在跑 3 个', pool.stats().running, 3);
  eq('并发上限：其余 6 个在排队', pool.stats().queued, 6);
  eq('并发上限：pending = 9', pool.stats().pending, 9);

  for (const g of gates) g.resolve();
  const results = await within(2000, () => Promise.all(tasks), '9 个任务全部完成');

  eq('并发上限：观测峰值等于 concurrency', peak, 3);
  eq('并发上限：统计峰值等于 concurrency', pool.stats().peakRunning, 3);
  eq('并发上限：9 个结果全部返回', results.length, 9);
  check('并发上限：无任务失败', results.every((r) => typeof r === 'number'));
  await pool.drain();
  eq('并发上限：drain 后 running/queued 归零', `${pool.stats().running}/${pool.stats().queued}`, '0/0');
}

// ---------- 2. 启动顺序 = 提交顺序（FIFO） ----------
{
  const pool = new TaskPool({ concurrency: 1, name: 'fifo' });
  const started = [];
  const gates = Object.fromEntries(['a', 'b', 'c', 'd'].map((k) => [k, gate(k)]));
  const tasks = ['a', 'b', 'c', 'd'].map((k) =>
    settleNoThrow(
      pool.submit(
        async () => {
          started.push(k);
          await gates[k].promise;
          return k;
        },
        { label: k },
      ),
    ),
  );

  for (const k of ['a', 'b', 'c', 'd']) {
    await waitUntil(() => started.length === ['a', 'b', 'c', 'd'].indexOf(k) + 1, { label: `${k} 已启动` });
    gates[k].open();
  }
  await within(1000, () => Promise.all(tasks), 'FIFO 四个任务');
  eq('调度顺序：串行时启动顺序等于提交顺序', started.join(','), 'a,b,c,d');
}

// ---------- 3. 队列有硬上限，满了立刻拒绝 ----------
{
  const pool = new TaskPool({ concurrency: 1, maxQueue: 2, name: 'bounded' });
  const blocker = gate('blocker');
  const t0 = settleNoThrow(pool.submit(() => blocker.promise, { label: 't0' }));
  const t1 = settleNoThrow(pool.submit(() => 't1', { label: 't1' }));
  const t2 = settleNoThrow(pool.submit(() => 't2', { label: 't2' }));
  const t3 = settleNoThrow(pool.submit(() => 't3', { label: 't3' }));

  const err = await within(500, () => t3, '第 4 个提交');
  check('队列上限：超出 maxQueue 的任务被拒绝', err instanceof PoolError);
  eq('队列上限：错误码 E_QUEUE_FULL', err.code, POOL_CODES.QUEUE_FULL);
  eq('队列上限：错误里带出 maxQueue', err.maxQueue, 2);
  eq('队列上限：queued 停在 maxQueue', pool.stats().queued, 2);
  eq('队列上限：pending 不超过 concurrency + maxQueue', pool.stats().pending, 3);
  atMost('队列上限：peakQueue 不超过 maxQueue', pool.stats().peakQueue, 2);

  blocker.open();
  await within(1000, () => Promise.all([t0, t1, t2]), '放行后续任务');
  await pool.drain();
}

// ---------- 4. maxQueue = 0：有槽就跑，无槽直接拒 ----------
{
  const pool = new TaskPool({ concurrency: 1, maxQueue: 0, name: 'no-queue' });
  const g = gate('g');
  const first = settleNoThrow(pool.submit(() => g.promise, { label: 'first' }));
  const second = await within(500, () => settleNoThrow(pool.submit(() => 'second', { label: 'second' })), '第二个提交');
  eq('maxQueue=0：无空槽时直接拒绝', second.code, POOL_CODES.QUEUE_FULL);
  g.open();
  await within(500, () => first, '第一个完成');
  const third = await within(500, () => settleNoThrow(pool.submit(() => 'third', { label: 'third' })), '第三个提交');
  eq('maxQueue=0：有空槽时照常执行', third, 'third');
}

// ---------- 5. 关闭语义 ----------
{
  const pool = new TaskPool({ concurrency: 1, name: 'closing' });
  const g = gate('g');
  const running = settleNoThrow(pool.submit(() => g.promise, { label: 'running' }));
  const queued = settleNoThrow(pool.submit(() => 'queued', { label: 'queued' }));
  await waitUntil(() => pool.stats().running === 1 && pool.stats().queued === 1, { label: '一跑一排' });

  pool.close();
  const queuedErr = await within(500, () => queued, '排队任务随关闭结算');
  eq('关闭：排队任务被拒绝', queuedErr.code, POOL_CODES.CLOSED);
  const rejectedAfterClose = await within(500, () => settleNoThrow(pool.submit(() => 'x', { label: 'late' })), '关闭后提交');
  eq('关闭：新任务被拒绝且不执行', rejectedAfterClose.code, POOL_CODES.CLOSED);
  eq('关闭：已在执行的未被抢占', pool.stats().running, 1);

  g.open();
  await within(500, () => running, '执行中的任务跑完');
  await within(500, () => pool.drain(), '关闭后仍可 drain');
  eq('关闭：drain 后 running=0', pool.stats().running, 0);
}

// ---------- 6. 同步抛错的函数也走 rejected 路径 ----------
{
  const pool = new TaskPool({ concurrency: 2, name: 'sync-throw' });
  const syncErr = await within(500, () => settleNoThrow(pool.submit(() => { throw new Error('sync-boom'); }, { label: 'sync' })), '同步抛错');
  eq('同步抛错：被转成 rejected 而非崩溃', syncErr.message, 'sync-boom');
  const asyncErr = await within(500, () => settleNoThrow(pool.submit(async () => { throw new Error('async-boom'); }, { label: 'async' })), '异步抛错');
  eq('异步抛错：被转成 rejected', asyncErr.message, 'async-boom');
  eq('异常：两个任务都从 running 移除', pool.stats().running, 0);
  eq('异常：统计 rejected = 2', pool.stats().rejected, 2);
}

// ---------- 7. 参数校验 ----------
{
  let concurrencyErr = null;
  let maxQueueErr = null;
  try {
    new TaskPool({ concurrency: 0 });
  } catch (error) {
    concurrencyErr = error;
  }
  try {
    new TaskPool({ maxQueue: -1 });
  } catch (error) {
    maxQueueErr = error;
  }
  check('参数：concurrency=0 抛 RangeError', concurrencyErr instanceof RangeError);
  check('参数：maxQueue=-1 抛 RangeError', maxQueueErr instanceof RangeError);
}

await sleep(20);
summary('test_pool');
