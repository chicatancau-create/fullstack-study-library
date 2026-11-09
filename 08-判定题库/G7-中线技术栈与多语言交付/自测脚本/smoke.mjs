import { compareContract } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof compareContract === 'function');
if (typeof compareContract !== 'function') process.exit(1);
