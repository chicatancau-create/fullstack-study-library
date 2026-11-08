import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('src').filter((n) => n.endsWith('.js') || n.endsWith('.mjs')).map((n) => `src/${n}`);
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(`build: ${files.length} files checked, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
