import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.createPool || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 createPool');
  process.exit(2);
}
let checks = 0;
let fails = 0;
function eq(name, actual, expected) {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    fails += 1;
    console.error(`FAIL ${name}: ${a} != ${e}`);
  } else {
    console.log(`ok ${name}`);
  }
}

const pool = fn(2);
let peak = 0;
const task = (ms) => () => new Promise((r) => setTimeout(() => { peak = Math.max(peak, pool.stats().running); r(ms); }, ms));
const results = await Promise.all([pool.run(task(30)), pool.run(task(10)), pool.run(task(5)), pool.run(task(1))]);
eq('并发不超过 2', pool.stats().peak, 2);
eq('全部完成', results.sort((a,b)=>a-b), [1,5,10,30]);
eq('FIFO 执行', peak, 2);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
