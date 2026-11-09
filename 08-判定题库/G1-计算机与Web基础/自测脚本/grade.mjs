import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.a11yIssues || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 a11yIssues');
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

eq('合格页面无问题', fn('<html lang="zh"><meta name="viewport" content="width=device-width"><img alt="x"><input id="q"></html>'), []);
eq('缺失项全部报出', fn('<html><img src=x><input></html>'), ['html-lang','img-alt','input-label','viewport']);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
