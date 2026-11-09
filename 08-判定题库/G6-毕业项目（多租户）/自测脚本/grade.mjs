import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.tenantView || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 tenantView');
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

const rows = [{ tenantId: 't1', id: 1 }, { tenantId: 't2', id: 2 }];
const view = fn(rows, 't1', 'alice', 123);
eq('只返回本租户', view.rows.map((r) => r.id), [1]);
eq('审计字段齐全', Object.keys(view.audit).sort(), ['after','before','what','when','who']);
eq('审计 before/after', [view.audit.before, view.audit.after], [2, 1]);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
