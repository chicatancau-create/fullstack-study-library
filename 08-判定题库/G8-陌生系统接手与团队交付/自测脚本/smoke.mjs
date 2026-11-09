import { normalizeOrders } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof normalizeOrders === 'function');
if (typeof normalizeOrders !== 'function') process.exit(1);
