import { canAccess } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof canAccess === 'function');
if (typeof canAccess !== 'function') process.exit(1);
