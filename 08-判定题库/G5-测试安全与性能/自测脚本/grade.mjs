import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.validateOrder || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 validateOrder');
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

eq('合法输入', fn({ sku: 'SKU-1', qty: 2, note: 'ok' }), []);
eq('数量越界', fn({ sku: 'SKU-1', qty: 0 }), ['qty']);
eq('SKU 非法', fn({ sku: 'x', qty: 1 }), ['sku']);
eq('XSS 字符', fn({ sku: 'SKU-1', qty: 1, note: '<script>' }), ['xss']);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
