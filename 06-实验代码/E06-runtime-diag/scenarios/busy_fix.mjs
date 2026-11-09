// 忙循环的三种处理：阻塞、setImmediate 分片、worker_threads。
// 输出每种的 event loop max/mean/p99 与总耗时，作为修复前后对照。
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { busyWait, chunkedCompute, measureLoop } from '../src/loop.mjs';

const WORK_MS = 200;

const block = await measureLoop(async () => {
  const t = performance.now();
  busyWait(WORK_MS);
  return performance.now() - t;
});

const chunk = await measureLoop(async () => {
  const t = performance.now();
  await chunkedCompute(WORK_MS, 10);
  return performance.now() - t;
});

const worker = await measureLoop(() => new Promise((resolve, reject) => {
  const w = new Worker(new URL('./busy_worker.js', import.meta.url), { workerData: { ms: WORK_MS } });
  w.once('message', (msg) => { w.terminate(); resolve(msg); });
  w.once('error', reject);
}));

const round = (m) => ({ max: Number(m.maxMs.toFixed(1)), mean: Number(m.meanMs.toFixed(1)), p99: Number(m.p99Ms.toFixed(1)) });
const lines = [
  `忙循环 ${WORK_MS}ms 的三种处理（monitorEventLoopDelay, resolution=5ms）`,
  `阻塞     : max=${round(block).max}ms mean=${round(block).mean}ms p99=${round(block).p99}ms`,
  `分片     : max=${round(chunk).max}ms mean=${round(chunk).mean}ms p99=${round(chunk).p99}ms（setImmediate，10ms/片）`,
  `worker   : max=${round(worker).max}ms mean=${round(worker).mean}ms p99=${round(worker).p99}ms（主线程只等消息）`,
];
console.log(lines.join('\n'));

assert.ok(block.maxMs >= 150, `阻塞应让事件循环停顿接近 200ms，实际 ${block.maxMs}`);
assert.ok(chunk.maxMs < block.maxMs / 3, `分片后 max 应显著下降，实际 ${chunk.maxMs} vs ${block.maxMs}`);
assert.ok(worker.maxMs < block.maxMs / 3, `worker 后 max 应显著下降，实际 ${worker.maxMs} vs ${block.maxMs}`);
