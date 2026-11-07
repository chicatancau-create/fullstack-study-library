// 句柄泄漏：创建 100 个未清理的 setInterval，观察 active resources 增长与清理。
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const timersOf = () => process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length;
const before = timersOf();
const timers = [];
for (let i = 0; i < 100; i += 1) {
  timers.push(setInterval(() => {}, 1000));
}
await sleep(20);
const during = timersOf();
console.log(`timeouts before=${before} during=${during}`);
if (during - before < 90) {
  console.error('FD FAIL: 未观察到 Timeout 句柄增长');
  process.exit(1);
}

for (const timer of timers) clearInterval(timer);
await sleep(50);
const after = timersOf();
console.log(`timeouts after_clear=${after}`);
if (after > before + 5) {
  console.error('FD FAIL: 清理后句柄未回落');
  process.exit(1);
}
console.log('FD PASS');