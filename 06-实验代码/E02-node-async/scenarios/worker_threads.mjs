import { Worker } from 'node:worker_threads';
import os from 'node:os';

const TASKS = 4;
const ITERATIONS = 12_000_000;

function cpuWork(n) {
  let acc = 0;
  for (let i = 0; i < n; i++) acc = (acc + (i * 2654435761) % 1000003) >>> 0;
  return acc;
}

function runWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const { parentPort, workerData } = require('node:worker_threads');
       let acc = 0;
       for (let i = 0; i < workerData.n; i++) acc = (acc + (i * 2654435761) % 1000003) >>> 0;
       parentPort.postMessage(acc);`,
      { eval: true, workerData: { n: ITERATIONS } },
    );
    worker.once('message', resolve);
    worker.once('error', reject);
  });
}

async function time(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, result };
}

const expected = cpuWork(ITERATIONS);

let serialTicks = 0;
let serialTimer = setInterval(() => { serialTicks++; }, 10);
const serial = await time(async () => {
  const values = [];
  for (let i = 0; i < TASKS; i++) values.push(cpuWork(ITERATIONS));
  return values;
});
clearInterval(serialTimer);

let workerTicks = 0;
let workerTimer = setInterval(() => { workerTicks++; }, 10);
const parallel = await time(() => Promise.all(Array.from({ length: TASKS }, runWorker)));
clearInterval(workerTimer);

const allMatch = [...serial.result, ...parallel.result].every((value) => value === expected);
const speedup = serial.ms / parallel.ms;

console.log(`cpu_parallelism=${os.availableParallelism()}`);
console.log(`workers=1+${TASKS} iterations=${ITERATIONS}`);
console.log(`serial_4_tasks_ms=${serial.ms.toFixed(2)} serial_ticks=${serialTicks}`);
console.log(`worker_4_tasks_ms=${parallel.ms.toFixed(2)} worker_ticks=${workerTicks}`);
console.log(`speedup=${speedup.toFixed(2)}x`);
console.log(`all_results_match=${allMatch ? 'YES' : 'FAIL'}`);
console.log(`event_loop_responsive=${workerTicks > serialTicks * 2 ? 'YES' : 'FAIL'}`);

if (!allMatch || speedup < 1.2 || workerTicks <= serialTicks * 2) {
  console.log('WORKER_THREADS FAIL');
  process.exit(1);
}
console.log('WORKER_THREADS PASS');
