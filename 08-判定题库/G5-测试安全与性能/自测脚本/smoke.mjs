import { validateOrder } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof validateOrder === 'function');
if (typeof validateOrder !== 'function') process.exit(1);
