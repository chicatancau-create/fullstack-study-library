import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.normalizeOrders || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 normalizeOrders');
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

const out = fn([{ id: 1, qty: -2, price: 10 }, { id: 1, qty: 3, price: 10 }, { id: 2, qty: 2.9, price: 5 }]);
eq('去重保留首条', out.map((o) => o.id), [1, 2]);
eq('负数量归零', out[0].qty, 0);
eq('金额重算', out[1].total, 10);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
