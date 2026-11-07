import { TaskPool, PoolError, POOL_CODES } from '../src/pool.mjs';
import { check, eq, near, atMost, banner, info, summary, within } from './tapmini.mjs';
import { gate, nowMs, sleep, waitUntil } from '../src/measure.mjs';

banner('E02 / 超时只让调用方停止等待，不代表底层操作已撤销');

const guard = (p) => {
  p.catch(() => {});
  return p;
};
const asError = (p) => p.catch((error) => error);

// ============ A. 超时把调用方摘出去，底层照跑 ============
{
  const pool = new TaskPool({ concurrency: 4, maxQueue: 8, name: 'timeout' });
  const g = gate('slow');
  let fnStartedAt = null;
  let fnFinishedAt = null;

  const t0 = nowMs();
  const p = guard(
    pool.submit(
      async () => {
        fnStartedAt = nowMs();
        await g.promise;
        fnFinishedAt = nowMs();
        return 'late-result';
      },
      { timeoutMs: 60, label: 'slow' },
    ),
  );

  const err = await within(500, () => asError(p), '超时后的结算');
  const elapsed = nowMs() - t0;

  check('超时：拒绝对象是 PoolError', err instanceof PoolError);
  eq('超时：错误码 E_POOL_TIMEOUT', err.code, POOL_CODES.TIMEOUT);
  near('超时：在 60ms 附近停止等待（50~200ms）', elapsed, 50, 200);
  eq('超时：错误明确标注底层仍在跑', err.underlyingStillRunning, true);
  check('超时：消息没有声称已撤销', !/撤销成功|已中止|aborted successfully/.test(err.message), err.message);

  eq('超时：底层函数已启动', fnStartedAt !== null, true);
  eq('超时：底层函数尚未结束', fnFinishedAt, null);
  eq('超时：槽位仍被底层占着', pool.stats().running, 1);
  eq('超时：统计 timeouts = 1', pool.stats().timeouts, 1);
  eq('超时：此时还没有「超时后完成」的记录', pool.stats().lateAfterTimeout, 0);
  info(`超时发生在 ${elapsed.toFixed(1)}ms，底层此刻仍阻塞在 await 上`);

  // 放行底层：它按自己的节奏完成，结果不再有人接收
  g.open();
  await within(1000, () => pool.drain(), 'drain 等底层结束');
  check('超时：底层最终自行结束', fnFinishedAt !== null);
  check('超时：结束时刻晚于超时拒绝时刻', fnFinishedAt - t0 > 60, `finishedAt-offset=${(fnFinishedAt - t0).toFixed(1)}ms`);
  eq('超时：记录了一次迟到的底层完成', pool.stats().lateAfterTimeout, 1);
  eq('超时：迟到完成没有算成 fulfilled', pool.stats().fulfilled, 0);
  eq('超时：池最终空闲', `${pool.stats().running}/${pool.stats().queued}`, '0/0');
}

// ============ B. 超时占用的槽位会拖慢队列 ============
{
  const pool = new TaskPool({ concurrency: 1, maxQueue: 4, name: 'timeout-slot' });
  const g = gate('slow');
  const quick = [];

  const p1 = guard(pool.submit(async () => {
    await g.promise;
    return 'slow';
  }, { timeoutMs: 30, label: 'slow' }));

  const p2 = pool.submit(async () => {
    quick.push('quick-done');
    return 'quick';
  }, { label: 'quick' });

  const err1 = await within(500, () => asError(p1), '慢任务超时');
  eq('槽位占用：慢任务已超时拒绝', err1.code, POOL_CODES.TIMEOUT);
  eq('槽位占用：快任务被堵在队列里（并发 1）', quick.length, 0);
  eq('槽位占用：队列里还压着 1 个', pool.stats().queued, 1);
  info('即使调用方已经不再等慢任务，它没让出槽位，后面的任务只能排队');

  g.open();
  await within(1000, () => p2, '快任务执行');
  eq('槽位占用：底层结束后快任务才跑', quick.join(','), 'quick-done');
}

// ============ C. 先完成的任务不应该被超时误伤 ============
{
  const pool = new TaskPool({ concurrency: 2, name: 'no-false-timeout' });
  const value = await within(1000, () => pool.submit(async () => {
    await sleep(5);
    return 'ok';
  }, { timeoutMs: 300, label: 'fast' }), '快任务');
  eq('误伤：先完成的任务正常返回', value, 'ok');
  eq('误伤：没有触发超时', pool.stats().timeouts, 0);
  await sleep(50);
  eq('误伤：定时器已被清理，不会事后误报', pool.stats().timeouts, 0);
}

// ============ D. 超时之后底层再抛错，不能变成未处理拒绝 ============
{
  const pool = new TaskPool({ concurrency: 1, name: 'late-reject' });
  const p = guard(pool.submit(async () => {
    await sleep(80);
    throw new Error('late-boom');
  }, { timeoutMs: 20, label: 'late-boom' }));

  const err = await within(500, () => asError(p), '先超时');
  eq('迟到失败：调用方看到的是超时', err.code, POOL_CODES.TIMEOUT);
  await sleep(150);
  eq('迟到失败：底层抛出被池吸收，未产生未处理拒绝', pool.stats().running, 0);
  eq('迟到失败：仍记录为超时后完成', pool.stats().lateAfterTimeout, 1);
}

// ============ E. 超时与并发上限共同构成上界 ============
{
  const pool = new TaskPool({ concurrency: 3, maxQueue: 3, name: 'bounded-timeout' });
  const submitted = [];
  // 生产端先等位再提交：既不撑爆队列，也不会把排队时间误当成执行超时
  for (let i = 0; i < 12; i++) {
    await pool.waitForSlot();
    submitted.push(guard(pool.submit(async () => {
      await sleep(20);
      return i;
    }, { timeoutMs: 200, label: `i${i}` })));
  }
  const results = await within(3000, () => Promise.allSettled(submitted), '12 个任务');
  eq('上界：12 个任务全部有结果', results.length, 12);
  check('上界：12 个任务全部 fulfilled', results.every((r) => r.status === 'fulfilled'));
  eq('上界：没有因为排队而误判超时', pool.stats().timeouts, 0);
  eq('上界：并发峰值不超过 3', pool.stats().peakRunning, 3);
  atMost('上界：队列峰值不超过 maxQueue', pool.stats().peakQueue, 3);
  eq('上界：队列没有无限增长', pool.stats().submitted, 12);
  await waitUntil(() => pool.stats().running === 0, { label: '清空' });
}

summary('test_timeout');
