import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('src').filter((name) => name.endsWith('.js')).map((name) => `src/${name}`);
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
console.log(`build: ${files.length} files checked, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
