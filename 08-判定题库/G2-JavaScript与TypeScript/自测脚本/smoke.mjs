import { createPool } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof createPool === 'function');
if (typeof createPool !== 'function') process.exit(1);
