import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.canAccess || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 canAccess');
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

const owner = { role: 'owner', tenantId: 't1' };
eq('同租户 owner 可读', fn(owner, 'read', { tenantId: 't1' }), true);
eq('跨租户拒绝', fn(owner, 'read', { tenantId: 't2' }), false);
eq('member 不能写', fn({ role: 'member', tenantId: 't1' }, 'write', { tenantId: 't1' }), false);
eq('admin 可写不可管', [fn({ role: 'admin', tenantId: 't1' }, 'write', { tenantId: 't1' }), fn({ role: 'admin', tenantId: 't1' }, 'manage', { tenantId: 't1' })], [true, false]);

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
