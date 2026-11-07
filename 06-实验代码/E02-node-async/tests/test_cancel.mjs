import { TaskPool, POOL_CODES } from '../src/pool.mjs';
import { check, eq, banner, info, summary, within } from './tapmini.mjs';
import { gate, nowMs, waitUntil } from '../src/measure.mjs';

banner('E02 / 取消：所有 Promise 必须结算，底层不因取消而消失');

const guard = (p) => {
  p.catch(() => {});
  return p;
};
const asError = (p) => p.catch((error) => error);

// ============ A. 逐个取消：排队中 vs 执行中 ============
{
  const pool = new TaskPool({ concurrency: 2, maxQueue: 10, name: 'cancel' });
  const started = [];
  const underlying = [];
  const gates = Array.from({ length: 5 }, (_, i) => gate(`g${i}`));
  const controllers = Array.from({ length: 5 }, () => new AbortController());

  const tasks = controllers.map((ac, i) =>
    guard(
      pool.submit(
        async () => {
          started.push(`t${i}`);
          await gates[i].promise;
          underlying.push(`t${i}`);
          return i;
        },
        { signal: ac.signal, label: `t${i}` },
      ),
    ),
  );

  await waitUntil(() => pool.stats().running === 2 && pool.stats().queued === 3, { label: '2 跑 3 排' });
  eq('取消前：运行中 2 个', pool.stats().running, 2);
  eq('取消前：排队 3 个', pool.stats().queued, 3);

  // t0 在跑，t2/t3 在排
  controllers[0].abort('user-cancel');
  controllers[2].abort('user-cancel');
  controllers[3].abort('user-cancel');

  const settledEarly = await within(500, () => Promise.allSettled([tasks[0], tasks[2], tasks[3]]), '取消的三个立即结算');
  check('取消：三个调用方承诺都在 500ms 内结算', settledEarly.every((s) => s.status === 'rejected'));
  check(
    '取消：错误码统一为 E_POOL_CANCELLED',
    settledEarly.every((s) => s.reason?.code === POOL_CODES.CANCELLED),
  );
  eq('取消：执行中被取消标记了底层仍在跑', settledEarly[0].reason?.underlyingStillRunning, true);
  eq('取消：排队中被取消标记了底层未启动', settledEarly[1].reason?.underlyingStillRunning, false);

  eq('取消：执行中被取消的槽位仍被占用', pool.stats().running, 2);
  eq('取消：两个排队的已出队', pool.stats().queued, 1);
  eq('取消：被取消的排队任务从未执行', started.join(','), 't0,t1');
  eq('取消：底层 t0 尚未结束', underlying.includes('t0'), false);
  eq('取消：统计 cancelledQueued = 2', pool.stats().cancelledQueued, 2);
  eq('取消：统计 cancelledRunning = 1', pool.stats().cancelledRunning, 1);

  // 放行被取消的 t0：底层真正结束后槽位才释放
  gates[0].open();
  await waitUntil(() => underlying.includes('t0'), { label: 't0 底层结束' });
  await waitUntil(() => pool.stats().running === 2 && pool.stats().queued === 0, { label: 't4 顶上空出的槽' });
  eq('取消：底层结束后才让出槽位', pool.stats().running, 2);
  eq('取消：排队中的 t4 随后开始执行', started.includes('t4'), true);
  eq('取消：底层 t0 在取消之后仍完成了自己的逻辑', underlying.includes('t0'), true);
  eq('取消：t0 只被结算一次（调用方先收到取消）', pool.stats().lateAfterCancel, 1);

  // 再把剩下两个执行中的取消掉
  controllers[1].abort('shutdown');
  controllers[4].abort('shutdown');
  const t0 = nowMs();
  const settledAll = await within(500, () => Promise.allSettled(tasks), '五个承诺全部结算');
  const elapsed = nowMs() - t0;
  info(`全部结算耗时 ${elapsed.toFixed(2)}ms（取消不等待底层）`);

  check('取消：5 个承诺全部 rejected', settledAll.every((s) => s.status === 'rejected'));
  check('取消：没有一个承诺悬着', settledAll.length === 5);
  eq('取消：底层 t1 此刻尚未结束', underlying.includes('t1'), false);

  gates[1].open();
  gates[4].open();
  await within(1000, () => pool.drain(), 'drain 等底层全部结束');
  eq('清理：drain 后 running=0', pool.stats().running, 0);
  eq('清理：drain 后 queued=0', pool.stats().queued, 0);
  eq('清理：五个底层函数都真实跑完了', underlying.sort().join(','), 't0,t1,t4');
  eq('清理：三个被取消的执行中任务事后完成', pool.stats().lateAfterCancel, 3);
  eq('清理：被取消的 t2/t3 确实没有执行', started.includes('t2') || started.includes('t3'), false);
}

// ============ B. cancelAll 一次取消全部 ============
{
  const pool = new TaskPool({ concurrency: 2, maxQueue: 5, name: 'cancel-all' });
  const gates = Array.from({ length: 4 }, (_, i) => gate(`g${i}`));
  const tasks = gates.map((g, i) =>
    guard(
      pool.submit(
        async () => {
          await g.promise;
          return i;
        },
        { label: `c${i}` },
      ),
    ),
  );

  await waitUntil(() => pool.stats().running === 2 && pool.stats().queued === 2, { label: '2 跑 2 排' });
  const affected = pool.cancelAll('shutdown');
  eq('cancelAll：影响 4 个任务', affected, 4);

  const settled = await within(500, () => Promise.allSettled(tasks), 'cancelAll 后全部结算');
  check('cancelAll：全部 rejected', settled.every((s) => s.status === 'rejected'));
  check('cancelAll：原因被带出', settled.every((s) => s.reason?.reason === 'shutdown'));
  eq('cancelAll：队列清空', pool.stats().queued, 0);

  for (const g of gates) g.open();
  await within(1000, () => pool.drain(), 'cancelAll 后 drain');
  eq('cancelAll：drain 后无残留', `${pool.stats().running}/${pool.stats().queued}`, '0/0');
}

// ============ C. 提交时信号已中止 ============
{
  const pool = new TaskPool({ concurrency: 1, name: 'pre-aborted' });
  const ac = new AbortController();
  ac.abort('already');
  let ran = false;
  const err = await within(500, () => asError(pool.submit(async () => {
    ran = true;
  }, { signal: ac.signal, label: 'never' })), '预先中止的提交');
  eq('预先中止：直接拒绝', err.code, POOL_CODES.CANCELLED);
  eq('预先中止：函数未被调用', ran, false);
  eq('预先中止：未进入统计 started', pool.stats().started, 0);
}

// ============ D. 取消不会让 Promise 变成永远 pending ============
{
  const pool = new TaskPool({ concurrency: 1, maxQueue: 1, name: 'no-hang' });
  const g = gate('never-open');
  const ac = new AbortController();
  const p1 = guard(pool.submit(() => g.promise, { signal: ac.signal, label: 'hung' }));
  const p2 = guard(pool.submit(() => g.promise, { signal: ac.signal, label: 'queued-hung' }));
  await waitUntil(() => pool.stats().running === 1 && pool.stats().queued === 1, { label: '一跑一排' });

  const t0 = nowMs();
  pool.cancelAll('test');
  const results = await within(300, () => Promise.allSettled([p1, p2]), '两个承诺');
  const elapsed = nowMs() - t0;
  check('无界等待：两个承诺在 300ms 内结算', results.every((s) => s.status === 'rejected'));
  check('无界等待：实际耗时远小于闸门时间', elapsed < 300, `elapsed=${elapsed.toFixed(2)}ms`);
  info('底层函数仍停在自己的闸门上，但调用方不会被拖住；池要用 drain 才能等到真正干净');
  eq('无界等待：底层还占着槽位', pool.stats().running, 1);
  g.open();
  await within(1000, () => pool.drain(), '最终清理');
  eq('无界等待：放行后槽位释放', pool.stats().running, 0);
}

summary('test_cancel');
