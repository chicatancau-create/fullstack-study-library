/**
 * 反例 2：同步 CPU 忙循环。
 * 目的：证明 Promise/并发上限都换不来并行 —— 单线程事件循环被同步代码占住时，
 * 微任务、定时器、I/O 回调、超时判定全部一起停摆。
 */
import { TaskPool } from '../src/pool.mjs';
import { EventLoopLag, busyWait, fmt, nowMs, sleep } from '../src/measure.mjs';

console.log('# 反例 2：同步 CPU 忙循环');
console.log(`# 单线程事件循环：同步代码执行期间，任何回调都不可能插入`);
console.log('');

// ---------- A. 对照：纯 async 等待时，定时器几乎准点 ----------
{
  const lag = new EventLoopLag(10).start();
  const t0 = nowMs();
  for (let i = 0; i < 15; i++) await sleep(20);
  const elapsed = nowMs() - t0;
  const s = lag.stop();
  console.log('A. 对照：15 个 20ms 定时器依次等待');
  console.log(`   总耗时 ${fmt(elapsed, 1)}ms（理论 300ms）  事件循环延迟 mean=${fmt(s.mean, 2)}ms max=${fmt(s.max, 2)}ms`);
  console.log('   注：Windows 定时器粒度约 15.6ms，sleep(20) 实测约 31ms，故总耗时高于理论值；');
  console.log('       本节只关心延迟统计与 B/C/D 的相对差，绝对值不作断言。');
  console.log('');
}

// ---------- B. 一个 300ms 同步忙循环，把一个 20ms 定时器拖到 300ms 后 ----------
{
  const t0 = nowMs();
  let firedAt = null;
  const timer = new Promise((resolve) => {
    setTimeout(() => {
      firedAt = nowMs();
      resolve('fired');
    }, 20);
  });
  busyWait(300); // 同步阻塞，事件循环没有机会跑
  await timer;
  const lateness = firedAt - (t0 + 20);
  console.log('B. 反例：排一个 20ms 定时器，紧接着执行 300ms 同步忙循环');
  console.log(`   定时器实际晚到 ${fmt(lateness, 1)}ms（期望 20ms 准时）`);
  console.log('   => 超时判定、取消回调、心跳、日志刷新在这个窗口里全部失效');
  console.log('');
}

// ---------- C. 4 个忙任务 × concurrency=4：并发上限不等于并行 ----------
{
  const pool = new TaskPool({ concurrency: 4, maxQueue: 8, name: 'busy' });
  const t0 = nowMs();
  await Promise.all(
    Array.from({ length: 4 }, (_, i) => pool.submit(() => busyWait(100), { label: `busy${i}` })),
  );
  const elapsed = nowMs() - t0;
  const stats = pool.stats();
  console.log('C. 反例：4 个 100ms 同步忙循环，交给 concurrency=4 的池');
  console.log(`   并发峰值 ${stats.peakRunning}（上限确实是 4，池没有违约）`);
  console.log(`   总耗时 ${fmt(elapsed, 1)}ms ≈ 4 × 100ms，而不是 100ms`);
  console.log('   => 池允许 4 个「同时开始」，但 CPU 只有一个，实际是串行执行');
  console.log('');

  // D. 同一批任务改成 await 定时器，才真正重叠
  const pool2 = new TaskPool({ concurrency: 4, maxQueue: 8, name: 'async' });
  const t1 = nowMs();
  await Promise.all(Array.from({ length: 4 }, (_, i) => pool2.submit(() => sleep(100), { label: `async${i}` })));
  const elapsed2 = nowMs() - t1;
  console.log('D. 对照：同样 4 个任务，但等待的是 100ms 定时器');
  console.log(`   总耗时 ${fmt(elapsed2, 1)}ms ≈ 100ms`);
  console.log(`   => 同样的并发上限，异步等待才真正重叠；差别不在池，在任务本身是否让出线程`);
}

console.log('');
console.log('判定：');
console.log('- 并发上限只约束「同时在飞的任务数」，不提供 CPU 并行。');
console.log('- 同步忙循环会连超时定时器一起冻住：调用方设置的 timeoutMs 在阻塞期间不会触发，');
console.log('  所以「有超时」不等于「一定在超时时间点被叫醒」。');
console.log('- 处理 CPU 密集任务的正确方向是 worker_threads / 子进程，不是加大 concurrency。');
