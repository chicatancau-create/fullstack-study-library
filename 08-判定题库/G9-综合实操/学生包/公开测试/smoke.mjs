import { solvePaper } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof solvePaper === 'function');
if (typeof solvePaper !== 'function') process.exit(1);
