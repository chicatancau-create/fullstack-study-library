/**
 * 反例 3：生产快于消费。
 * 三种承载方式对照：
 *   A 无界队列（数组 push）—— 生产速度差全部转成内存与前缀延迟
 *   B 有界队列 + 满即拒绝 —— 有界，但丢任务，必须由生产方处理
 *   C 有界队列 + waitForSlot 等位 —— 有界，压力传回生产方，不丢任务
 */
import { TaskPool, POOL_CODES } from '../src/pool.mjs';
import { fmt, heapMB, nowMs, sleep, tick } from '../src/measure.mjs';

const N = 2000;
const CONCURRENCY = 8;
const MAX_QUEUE = 32;
const LIMIT = CONCURRENCY + MAX_QUEUE;

console.log('# 反例 3：生产快于消费');
console.log(`# 生产 ${N} 条、消费端每条 1 个 setImmediate 回合、池并发 ${CONCURRENCY}、队列上限 ${MAX_QUEUE}`);
console.log('');

// ---------- A. 无界队列 ----------
{
  const heap0 = heapMB();
  const t0 = nowMs();
  const queue = [];
  let peakQueue = 0;
  for (let i = 0; i < N; i++) {
    queue.push(i); // 没有上限，也没有 await
    peakQueue = Math.max(peakQueue, queue.length);
  }
  const producedAt = nowMs();
  console.log('A. 无界队列（数组直接 push）');
  console.log(`   生产 ${N} 条耗时 ${fmt(producedAt - t0, 2)}ms，队列峰值 ${peakQueue} 条`);
  console.log(`   此时堆增长 ${fmt(heapMB() - heap0, 2)}MB`);

  let consumed = 0;
  while (queue.length > 0) {
    queue.shift();
    consumed++;
    await tick();
  }
  console.log(`   消费完 ${consumed} 条，总耗时 ${fmt(nowMs() - t0, 1)}ms，堆增长 ${fmt(heapMB() - heap0, 2)}MB`);
  console.log(`   => 队列长度峰值 ${peakQueue}，等于生产量；换成每条 1KB 负载就是 ${fmt(peakQueue / 1024, 2)}MB 起步的驻留`);
  console.log('   => 更糟的是延迟：最先入队的任务要等全部前面排完，尾延迟不可控');
  console.log('');
}

// ---------- B. 有界 + 满即拒绝 ----------
{
  const pool = new TaskPool({ concurrency: CONCURRENCY, maxQueue: MAX_QUEUE, name: 'reject' });
  const heap0 = heapMB();
  const t0 = nowMs();
  let peakPending = 0;
  let rejected = 0;
  const all = [];

  for (let i = 0; i < N; i++) {
    const p = pool.submit(() => tick(), { label: `b${i}` });
    p.catch((error) => {
      if (error.code === POOL_CODES.QUEUE_FULL) rejected++;
      return null;
    });
    all.push(p);
    peakPending = Math.max(peakPending, pool.stats().pending);
  }
  const elapsedProduce = nowMs() - t0;
  await Promise.allSettled(all);
  await pool.drain();

  console.log('B. 有界队列 + 满即拒绝（E_QUEUE_FULL）');
  console.log(`   提交 ${N} 条耗时 ${fmt(elapsedProduce, 2)}ms，pending 峰值 ${peakPending}（上界 ${LIMIT}）`);
  console.log(`   被拒 ${rejected} 条（占 ${fmt((rejected / N) * 100, 1)}%），实际执行 ${pool.stats().fulfilled} 条，总耗时 ${fmt(nowMs() - t0, 1)}ms`);
  console.log(`   堆增长 ${fmt(heapMB() - heap0, 2)}MB，peakRunning=${pool.stats().peakRunning}，peakQueue=${pool.stats().peakQueue}`);
  console.log('   => 内存有界了，但任务丢了。丢任务必须是显式业务决策（重试、降级或回压），不能是静默');
  console.log('');
}

// ---------- C. 有界 + 等位 ----------
{
  const pool = new TaskPool({ concurrency: CONCURRENCY, maxQueue: MAX_QUEUE, name: 'wait' });
  const heap0 = heapMB();
  const t0 = nowMs();
  let peakPending = 0;
  let waits = 0;
  let waitedMs = 0;
  const all = [];

  for (let i = 0; i < N; i++) {
    if (pool.stats().queued >= MAX_QUEUE) {
      waits++;
      const w0 = nowMs();
      await pool.waitForSlot(); // 队列满就在这里停住，压力传回生产端
      waitedMs += nowMs() - w0;
    }
    all.push(pool.submit(() => tick(), { label: `c${i}` }));
    peakPending = Math.max(peakPending, pool.stats().pending);
  }
  const elapsedProduce = nowMs() - t0;
  const results = await Promise.allSettled(all);
  await pool.drain();

  const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
  console.log('C. 有界队列 + waitForSlot 等位');
  console.log(`   提交 ${N} 条耗时 ${fmt(elapsedProduce, 2)}ms（生产被拖慢），pending 峰值 ${peakPending}（上界 ${LIMIT}）`);
  console.log(`   生产方被迫等待 ${waits} 次，累计被阻塞 ${fmt(waitedMs, 2)}ms；${fulfilled}/${N} 条全部执行，无丢弃，总耗时 ${fmt(nowMs() - t0, 1)}ms`);
  console.log(`   堆增长 ${fmt(heapMB() - heap0, 2)}MB，peakRunning=${pool.stats().peakRunning}，peakQueue=${pool.stats().peakQueue}`);
  console.log('   => 不丢任务、内存有界，代价是生产端变慢（这就是背压的定义：压力必须回到产生它的地方）');
  console.log('');
}

console.log('判定：');
console.log('- 三者都能跑完，区别不在「能不能跑」，在于「失控时表现成什么」：');
console.log('  无界队列把失控变成内存与尾延迟；拒绝把失控变成丢任务；等位把失控变成生产端变慢。');
console.log('- 只有后两者有上界。要选哪一个，取决于上游能不能承受「变慢」还是更能承受「丢」。');
console.log(`- 本例上界 ${LIMIT} = concurrency ${CONCURRENCY} + maxQueue ${MAX_QUEUE}，是可算出来的常数。`);

void sleep;
