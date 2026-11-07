/**
 * 反例 1：无界并发。
 * 200 个任务一起冲，没有上限；对照一个 concurrency=20 的有界池。
 * 结论只看两个数：并发峰值、以及峰值是否随提交量线性增长。
 */
import { TaskPool } from '../src/pool.mjs';
import { EventLoopLag, fmt, heapMB, nowMs, sleep } from '../src/measure.mjs';

const N = 200;
const BOUND = 20;
const COST = 100;

await Promise.all(Array.from({ length: 20 }, () => sleep(5))); // 预热

async function unbounded() {
  let inFlight = 0;
  let peak = 0;
  const lag = new EventLoopLag(20).start();
  const heap0 = heapMB();
  const t0 = nowMs();
  await Promise.all(
    Array.from({ length: N }, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      try {
        await sleep(COST);
      } finally {
        inFlight--;
      }
    }),
  );
  const elapsed = nowMs() - t0;
  return { peak, elapsed, heap0, heap1: heapMB(), lag: lag.stop() };
}

async function bounded() {
  const pool = new TaskPool({ concurrency: BOUND, maxQueue: N, name: 'bounded' });
  let inFlight = 0;
  let peak = 0;
  const lag = new EventLoopLag(20).start();
  const heap0 = heapMB();
  const t0 = nowMs();
  await Promise.all(
    Array.from({ length: N }, () =>
      pool.submit(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        try {
          await sleep(COST);
        } finally {
          inFlight--;
        }
      }),
    ),
  );
  const elapsed = nowMs() - t0;
  const stats = pool.stats();
  return { peak, elapsed, heap0, heap1: heapMB(), lag: lag.stop(), stats };
}

const a = await unbounded();
const b = await bounded();

console.log('# 反例 1：无界并发 vs 有界池');
console.log(`# 任务数 ${N}，单个任务耗时 ${COST}ms（await 定时器代表一次下游调用）`);
console.log('');
console.log('方案                      并发峰值   总耗时(ms)   事件循环延迟 max(ms)   堆增长(MB)');
const row = (name, r) =>
  console.log(
    `${name.padEnd(22)}  ${String(r.peak).padStart(8)}  ${fmt(r.elapsed, 1).padStart(11)}  ` +
      `${fmt(r.lag.max, 1).padStart(20)}  ${fmt(r.heap1 - r.heap0, 2).padStart(10)}`,
  );
row('Promise.all（无界）', a);
row(`TaskPool（上限 ${BOUND}）`, b);

console.log('');
console.log('判定：');
console.log(`- 无界方案并发峰值 ${a.peak} = 提交量 ${N}，提交量翻倍峰值就翻倍，没有任何上界。`);
console.log(`- 有界方案并发峰值 ${b.peak}，与提交量无关，只由 concurrency 决定；peakQueue=${b.stats.peakQueue}。`);
console.log(`- 无界方案更快（${fmt(a.elapsed, 1)}ms vs ${fmt(b.elapsed, 1)}ms），代价是把 ${a.peak} 个并发同时压给下游。`);
console.log('- 本例用定时器代表下游调用，所以「打满」看不见；换成数据库连接、文件句柄或上游限流时，');
console.log(`  ${a.peak} 个并发会直接变成连接耗尽或 429。这正是无界并发不能上生产的原因。`);
console.log('- 采样堆增长受 GC 时机影响，只用于量级参考，不作为断言。');
