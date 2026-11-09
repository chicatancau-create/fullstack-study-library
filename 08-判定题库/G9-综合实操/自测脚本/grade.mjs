import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.solvePaper || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 solvePaper');
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

eq('A 卷拓扑序', fn('A', [{ id: 'b', dependsOn: ['a'] }, { id: 'a' }]), ['a','b']);
eq('B 卷对账', fn('B', [{ account: 'x', type: 'debit', amount: 5 }, { account: 'x', type: 'credit', amount: 8 }]), { x: 3 });
let cycle = false;
try { fn('A', [{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }]); } catch { cycle = true; }
eq('环被拒绝', cycle, true);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
