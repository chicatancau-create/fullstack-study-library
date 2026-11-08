import { latestOnly } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof latestOnly === 'function');
if (typeof latestOnly !== 'function') process.exit(1);
