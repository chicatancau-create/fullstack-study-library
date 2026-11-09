import { tenantView } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof tenantView === 'function');
if (typeof tenantView !== 'function') process.exit(1);
