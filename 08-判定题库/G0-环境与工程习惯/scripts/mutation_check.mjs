// 自测脚本有效性检查：对参考答案注入受控缺陷，grade-repo.mjs 必须失败。
// 只用文本替换在工作副本里改文件，不改仓库文件。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildFixture } from '../fixture/build.mjs';
import { solveRepo } from '../参考答案/solve-repo.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'g0-mut-'));
const grader = path.resolve('自测脚本/grade-repo.mjs');

const fixtures = [
  {
    id: 'M1',
    why: '把冲突一侧丢掉（只留 feature 行）',
    apply(work) {
      writeFileSync(path.join(work, 'config/app.env'), 'LOG_LEVEL=info\nTIMEOUT_MS=60000\nRETRY=5\n', 'utf8');
      execFileSync('git', ['add', 'config/app.env'], { cwd: work });
      execFileSync('git', ['-c', 'user.name=L', '-c', 'user.email=l@e.test', 'commit', '-q', '--amend', '--no-edit'], { cwd: work });
    },
    expect: /R2 双方独有内容都保留/,
  },
  {
    id: 'M2',
    why: '把缺陷代码改回 off-by-one',
    apply(work) {
      const file = path.join(work, 'src/rolling_sum.js');
      writeFileSync(file, readFileSync(file, 'utf8').replace('for (const value of values)', 'for (let i = 0; i < values.length - 1; i += 1)')
        .replace('total += value;', 'total += values[i];'), 'utf8');
      execFileSync('git', ['add', 'src/rolling_sum.js'], { cwd: work });
      execFileSync('git', ['-c', 'user.name=L', '-c', 'user.email=l@e.test', 'commit', '-q', '--amend', '--no-edit'], { cwd: work });
    },
    expect: /R5/,
  },
  {
    id: 'M3',
    why: '把合成秘密强加进索引（绕过 .gitignore）',
    apply(work) {
      execFileSync('git', ['add', '-f', 'config/local.env'], { cwd: work });
      execFileSync('git', ['-c', 'user.name=L', '-c', 'user.email=l@e.test', 'commit', '-q', '--amend', '--no-edit'], { cwd: work });
    },
    expect: /R3 合成秘密未入库/,
  },
  {
    id: 'M4',
    why: '留一个未跟踪垃圾文件',
    apply(work) {
      writeFileSync(path.join(work, 'scratch-leftover.txt'), 'x\n', 'utf8');
    },
    expect: /R1 工作树干净/,
  },
];

let fails = 0;
for (const f of fixtures) {
  const dir = path.join(root, f.id);
  const built = buildFixture(dir);
  solveRepo(built.work);
  f.apply(built.work);
  let out;
  let code = 0;
  try {
    out = execFileSync(process.execPath, [grader, built.work], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    code = error.status ?? -1;
    out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  if (code === 0) {
    fails += 1;
    console.error(`FAIL ${f.id} 变体仍通过（${f.why}）`);
  } else if (!f.expect.test(out)) {
    fails += 1;
    console.error(`FAIL ${f.id} 失败但断言不符预期: ${out.split('\n').filter((l) => l.startsWith('FAIL')).join(' | ')}`);
  } else {
    const hit = out.split('\n').find((l) => l.startsWith('FAIL')) ?? '';
    console.log(`ok ${f.id} rc=${code} ${f.why} -> ${hit.slice(0, 70)}`);
  }
}

rmSync(root, { recursive: true, force: true });
console.log(`variants=${fixtures.length} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
