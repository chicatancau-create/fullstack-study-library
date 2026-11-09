// worker 线程里做同样的忙循环：主线程事件循环不被阻塞。
const { parentPort, workerData } = await import('node:worker_threads');

const started = performance.now();
const end = started + workerData.ms;
let x = 0;
while (performance.now() < end) x = (x + 1) % 1000003;
parentPort.postMessage({ x, elapsed: Math.round(performance.now() - started) });
