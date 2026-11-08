import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.compareContract || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 compareContract');
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

eq('完全一致', fn({ a: 1 }, { a: 1 }), { missing: [], extra: [], mismatch: [], compatible: true });
eq('缺字段不兼容', fn({ a: 1, b: 2 }, { a: 9 }), { missing: ['b'], extra: [], mismatch: ['a'], compatible: false });
eq('多字段兼容', fn({ a: 1 }, { a: 1, b: 2 }), { missing: [], extra: ['b'], mismatch: [], compatible: true });

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
