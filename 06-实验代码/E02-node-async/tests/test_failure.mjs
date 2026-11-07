import { TaskPool, POOL_CODES } from '../src/pool.mjs';
import { check, eq, atMost, banner, info, summary, within } from './tapmini.mjs';
import { gate, waitUntil } from '../src/measure.mjs';

banner('E02 / 首项失败时运行中与待运行任务的处理');

// 保留原有 reject 状态，只顺手挂一个空 catch 以免未处理拒绝告警
const guard = (p) => {
  p.catch(() => {});
  return p;
};
// 需要把错误当值来断言时用这个，会把 reject 转成 resolve
const asError = (p) => p.catch((error) => error);

// ============ A. failFast 打开 ============
{
  const pool = new TaskPool({ concurrency: 2, maxQueue: 10, failFast: true, name: 'failfast' });
  const events = [];
  const failGate = gate('F');
  const slowGate = gate('S2');

  const F = guard(
    pool.submit(
      async () => {
        events.push('F:start');
        await failGate.promise;
        events.push('F:throw');
        throw new Error('primary-failure');
      },
      { label: 'F' },
    ),
  );
  const S2 = guard(
    pool.submit(
      async () => {
        events.push('S2:start');
        await slowGate.promise;
        events.push('S2:done');
        return 'S2';
      },
      { label: 'S2' },
    ),
  );
  const queuedTasks = ['S3', 'S4', 'S5'].map((label) =>
    guard(
      pool.submit(
        async () => {
          events.push(`${label}:start`);
          return label;
        },
        { label },
      ),
    ),
  );

  await waitUntil(() => pool.stats().running === 2 && pool.stats().queued === 3, { label: '2 跑 3 排' });
  eq('首项失败前：运行中 2 个', pool.stats().running, 2);
  eq('首项失败前：排队 3 个', pool.stats().queued, 3);

  failGate.open();
  await waitUntil(() => pool.stats().firstError != null, { label: '首项失败已登记' });

  const snap = pool.stats().failFastSnapshot;
  info(`失败发生在 ${snap.failedTask.label}；快照 running=${snap.runningAtFailure.map((r) => r.label).join(',')} queued=${snap.queuedAtFailure.join(',')}`);

  eq('首项失败：快照记录了失败任务', snap.failedTask.label, 'F');
  eq('首项失败：快照记录当时仍在执行的任务', snap.runningAtFailure.map((r) => r.label).join(','), 'S2');
  eq('首项失败：快照记录当时待运行的任务', snap.queuedAtFailure.join(','), 'S3,S4,S5');
  eq('首项失败：待运行数量 = 3', snap.queuedCountAtFailure, 3);
  eq('首项失败：排队的 3 个立即被丢弃', snap.discardedCount, 3);
  eq('首项失败：队列已被清空', pool.stats().queued, 0);
  eq('首项失败：已在执行的不被抢占，仍在跑', pool.stats().running, 1);
  eq('首项失败：被丢弃任务从未开始执行', events.filter((e) => e.startsWith('S3') || e.startsWith('S4') || e.startsWith('S5')).length, 0);

  // 失败后不再接收新任务
  const late = await within(500, () => asError(pool.submit(async () => 'late', { label: 'S6' })), '失败后提交');
  eq('首项失败：后续提交被拒绝', late.code, POOL_CODES.DISCARDED);

  // 放行仍在执行的任务，核对它按自己的节奏跑完
  slowGate.open();
  const settled = await within(1000, () => Promise.allSettled([F, S2, ...queuedTasks]), '全部结算');
  const status = (i) => settled[i].status;
  const code = (i) => settled[i].reason?.code;
  eq('结算：F rejected', status(0), 'rejected');
  eq('结算：F 保留原始错误信息', settled[0].reason?.message, 'primary-failure');
  eq('结算：S2 正常完成（不被抢占）', status(1), 'fulfilled');
  eq('结算：S2 结果正确', settled[1].value, 'S2');
  check('结算：S3/S4/S5 全部 rejected', [2, 3, 4].every((i) => status(i) === 'rejected'));
  check('结算：丢弃原因统一为 E_POOL_DISCARDED', [2, 3, 4].every((i) => code(i) === POOL_CODES.DISCARDED));
  check('结算：丢弃错误保留了首个失败作为 cause', [2, 3, 4].every((i) => settled[i].reason?.cause?.message === 'primary-failure'));
  eq('统计：真正开始执行的任务只有 2 个（F、S2）', pool.stats().started, 2);
  eq('统计：池不自动重试失败任务', pool.stats().started, 2);
  eq('统计：已登记首个失败', pool.stats().firstError?.message, 'primary-failure');
  info(`事件序列：${events.join(' -> ')}`);
}

// ============ B. failFast 关闭（对照） ============
{
  const pool = new TaskPool({ concurrency: 2, maxQueue: 10, failFast: false, name: 'continue' });
  const events = [];
  const failGate = gate('F');

  const F = asError(
    pool.submit(
      async () => {
        await failGate.promise;
        throw new Error('one-of-many');
      },
      { label: 'F' },
    ),
  );
  const others = ['S2', 'S3', 'S4'].map((label) =>
    guard(
      pool.submit(
        async () => {
          events.push(`${label}:start`);
          return label;
        },
        { label },
      ),
    ),
  );

  await waitUntil(() => pool.stats().running === 2, { label: '两个已启动' });
  failGate.open();
  const err = await within(1000, () => F, '失败任务结算');
  eq('对照：失败任务 rejected', err.message, 'one-of-many');
  await within(1000, () => Promise.all(others), '其余任务继续');
  eq('对照：单个失败不影响后续任务', pool.stats().fulfilled, 3);
  eq('对照：队列没有因为失败被清空', events.length, 3);
  check('对照：没有 failFast 快照', pool.stats().failFastSnapshot === null);
  atMost('对照：并发峰值仍受 concurrency 限制', pool.stats().peakRunning, 2);
}

summary('test_failure');
