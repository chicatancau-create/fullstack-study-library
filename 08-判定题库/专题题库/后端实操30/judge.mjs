import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = import.meta.dirname;
const dirs = readdirSync(root)
  .filter((d) => /^[A-E]\d{2}-/.test(d))
  .sort();
if (dirs.length !== 30) {
  console.error(`expected 30 task dirs, found ${dirs.length}`);
  process.exit(2);
}

function runOne(dir, impl) {
  const r = spawnSync(process.execPath, ['hidden/test.mjs'], {
    cwd: path.join(root, dir),
    env: { ...process.env, IMPL: path.join(root, dir, impl) },
    encoding: 'utf8',
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const lines = [`tasks=${dirs.length}`, `node=${process.version}`];
let pass = 0;
let fail = 0;
for (const dir of dirs) {
  const solution = runOne(dir, 'solution/index.mjs');
  const starter = runOne(dir, 'starter/index.mjs');
  const ok = solution.code === 0 && starter.code !== 0;
  if (ok) pass += 1;
  else fail += 1;
  lines.push(`${ok ? 'PASS' : 'FAIL'} ${dir} solution_exit=${solution.code} starter_exit=${starter.code}`);
  if (!ok && solution.code !== 0) lines.push(`  solution output: ${solution.out.slice(0, 300)}`);
}
lines.push(`passed=${pass} failed=${fail}`);
lines.push(fail === 0 ? 'BACKEND30 PASS' : 'BACKEND30 FAIL');
mkdirSync(path.join(root, 'evidence'), { recursive: true });
writeFileSync(path.join(root, 'evidence', 'judge.txt'), lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
process.exit(fail === 0 ? 0 : 1);
