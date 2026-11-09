import { resolveConflict } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof resolveConflict === 'function');
if (typeof resolveConflict !== 'function') process.exit(1);
