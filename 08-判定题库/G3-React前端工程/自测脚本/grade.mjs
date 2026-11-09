import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.latestOnly || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 latestOnly');
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

const guard = fn();
let resolveSlow;
const slow = new Promise((r) => { resolveSlow = r; });
const p1 = guard(slow);
const p2 = guard(Promise.resolve('new'));
eq('新请求生效', (await p2).value, 'new');
resolveSlow('old');
eq('旧响应被丢弃', (await p1).stale, true);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
