import { monitorEventLoopDelay } from 'node:perf_hooks';

export function busyWait(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) { /* spin */ }
}

export async function chunkedCompute(totalMs, chunkMs = 10) {
  const end = performance.now() + totalMs;
  let x = 0;
  while (performance.now() < end) {
    const sliceEnd = Math.min(end, performance.now() + chunkMs);
    while (performance.now() < sliceEnd) x = (x + 1) % 1000003;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return x;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function measureLoop(work, { settleMs = 50, warmupMs = 50 } = {}) {
  const histogram = monitorEventLoopDelay({ resolution: 5 });
  histogram.enable();
  // 先让直方图的计时器跑起来，否则首个 tick 还没建立，随后的阻塞不会被记录。
  await sleep(warmupMs);
  await work();
  await sleep(settleMs);
  histogram.disable();
  const ns = (v) => Number((v / 1e6).toFixed(2));
  return {
    maxMs: ns(histogram.max),
    meanMs: ns(histogram.mean),
    p99Ms: ns(histogram.percentile(99)),
  };
}
