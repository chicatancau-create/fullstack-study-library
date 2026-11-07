/**
 * 改变生产/消费速率后，队列与并发是否仍然有界。
 * 三档生产速率，同一套池参数（concurrency=4, maxQueue=16）。
 * 判定标准写在跑之前：任何一档的 pending 峰值都不能超过 concurrency + maxQueue = 20。
 */
import { TaskPool } from '../src/pool.mjs';
import { fmt, nowMs, sleep, tick } from '../src/measure.mjs';

const CONCURRENCY = 4;
const MAX_QUEUE = 16;
const LIMIT = CONCURRENCY + MAX_QUEUE;

const regimes = [
  { name: '生产远快于消费', items: 600, pace: async () => {} },
  { name: '生产接近消费', items: 300, pace: () => tick() },
  { name: '生产慢于消费', items: 60, pace: () => sleep(2) },
];

console.log('# 背压：生产/消费速率变化下的有界性');
console.log(`# 池参数固定 concurrency=${CONCURRENCY}、maxQueue=${MAX_QUEUE}，判定上界 pending <= ${LIMIT}`);
console.log('');

const rows = [];

for (const regime of regimes) {
  const pool = new TaskPool({ concurrency: CONCURRENCY, maxQueue: MAX_QUEUE, name: regime.name });
  let maxPending = 0;
  let waits = 0;
  let rejected = 0;
  const accepted = [];
  const t0 = nowMs();

  for (let i = 0; i < regime.items; i++) {
    if (pool.stats().queued >= MAX_QUEUE) {
      waits++;
      await pool.waitForSlot();
    }
    const p = pool.submit(() => tick(), { label: `${i}` });
    p.catch(() => {
      rejected++;
      return null;
    });
    accepted.push(p);
    maxPending = Math.max(maxPending, pool.stats().pending);
    await regime.pace();
  }

  const producedIn = nowMs() - t0;
  const results = await Promise.allSettled(accepted);
  await pool.drain();
  const elapsed = nowMs() - t0;
  const stats = pool.stats();
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length;

  rows.push({
    name: regime.name,
    items: regime.items,
    producedIn,
    elapsed,
    maxPending,
    peakRunning: stats.peakRunning,
    peakQueue: stats.peakQueue,
    waits,
    rejected,
    fulfilled,
    leftover: `${stats.running}/${stats.queued}`,
  });
}

console.log('档位              提交   生产耗时(ms)  总耗时(ms)  pending峰值  running峰值  队列峰值  等位次数  pending<=20');
for (const r of rows) {
  console.log(
    `${r.name.padEnd(16)}  ${String(r.items).padStart(4)}  ${fmt(r.producedIn, 1).padStart(11)}  ` +
      `${fmt(r.elapsed, 1).padStart(10)}  ${String(r.maxPending).padStart(11)}  ` +
      `${String(r.peakRunning).padStart(11)}  ${String(r.peakQueue).padStart(8)}  ${String(r.waits).padStart(8)}  ` +
      `${r.maxPending <= LIMIT ? 'YES' : 'NO'}`,
  );
}

console.log('');
console.log('判定：');
const allBounded = rows.every((r) => r.maxPending <= LIMIT);
const allConcurrencyBounded = rows.every((r) => r.peakRunning <= CONCURRENCY);
const allDrained = rows.every((r) => r.leftover === '0/0');
const allCompleted = rows.every((r) => r.fulfilled === r.items);

console.log(`- 三档 pending 峰值全部 <= ${LIMIT}：${allBounded ? '成立' : '不成立'}`);
console.log(`- 三档 running 峰值全部 <= ${CONCURRENCY}：${allConcurrencyBounded ? '成立' : '不成立'}`);
console.log(`- 三档结束后 running/queued 均归零（无残留）：${allDrained ? '成立' : '不成立'}`);
console.log(`- 三档任务全部完成、无丢弃：${allCompleted ? '成立' : '不成立'}`);
console.log('- 生产远快于消费时，总耗时由消费端能力决定，队列只是缓冲，不会把任务堆到内存里');
console.log('  （pending 卡在 20，生产端通过等位被动变慢：这就是背压）。');
console.log('- 生产慢于消费时，pending 很小，池处于空转，增大 maxQueue 没有任何收益。');
console.log('- 说明：本例消费端成本是 setImmediate 回合，绝对耗时只用于横向比较，不作为性能指标。');

if (!(allBounded && allConcurrencyBounded && allDrained && allCompleted)) {
  process.exitCode = 1;
}
