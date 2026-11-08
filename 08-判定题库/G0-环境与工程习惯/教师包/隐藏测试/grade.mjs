import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.resolveConflict || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 resolveConflict');
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

const out = fn(['a','b','<<<<<<< ours','x'], ['b','c','=======','>>>>>>> theirs']);
eq('合并双方独有行', out, ['a','b','x','c']);
eq('不含冲突标记', out.some((l) => l.includes('<<<<') || l.includes('====') || l.includes('>>>>')), false);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
