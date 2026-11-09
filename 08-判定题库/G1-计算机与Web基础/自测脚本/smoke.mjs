import { a11yIssues } from '../起始代码/index.mjs';
console.log('smoke: export exists ->', typeof a11yIssues === 'function');
if (typeof a11yIssues !== 'function') process.exit(1);
