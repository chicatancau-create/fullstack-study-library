// 事件循环延迟：同步忙循环期间 monitorEventLoopDelay 的 max 应显著升高。
import { monitorEventLoopDelay } from 'node:perf_hooks';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
await sleep(50);

const start = Date.now();
let x = 0;
while (Date.now() - start < 200) {
  x = (x + 1) % 1000003;
}
await sleep(50);
histogram.disable();

const maxMs = histogram.max / 1e6;
const meanMs = histogram.mean / 1e6;
console.log(`event_loop_delay max=${maxMs.toFixed(1)}ms mean=${meanMs.toFixed(1)}ms x=${x}`);
if (maxMs < 100) {
  console.error('LOOP FAIL: 忙循环未反映到事件循环延迟');
  process.exit(1);
}
console.log('LOOP PASS');