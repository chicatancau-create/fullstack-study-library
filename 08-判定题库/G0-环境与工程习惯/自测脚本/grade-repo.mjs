// G0 固定 fixture 自测脚本：对一个「已按题面处理过」的工作副本打分。
// 用法：node 自测脚本/grade-repo.mjs <工作副本目录>
//
// 判据（全部基于真实的 git 命令与真实执行，不看文件内容猜）：
//   R1 工作树干净：没有未合并路径、没有未跟踪垃圾
//   R2 冲突已解：无冲突标记，且双方独有内容都在（base 的 LOG_LEVEL=debug + feature 的 TIMEOUT_MS=60000/RETRY=5）
//   R3 合成秘密未入库：config/local.env 不被 git 跟踪
//   R4 合并提交存在：HEAD 有两个父提交（真合并，不是 reset 丢掉一侧）
//   R5 缺陷修复：rollingSum([0,1,2,3]) 返回 [0,1,3,6]
//   R6 自带回归测试：test/rolling_sum.test.js 通过
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.argv[2];
if (!target) {
  console.error('用法: node 自测脚本/grade-repo.mjs <工作副本目录>');
  process.exit(2);
}
const cwd = path.resolve(target);
if (!existsSync(path.join(cwd, '.git'))) {
  console.error(`FAIL 目标不是 git 工作副本: ${cwd}`);
  process.exit(2);
}

const git = (args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
});

let checks = 0;
let fails = 0;
const ok = (name, extra = '') => console.log(`ok ${name}${extra ? ` ${extra}` : ''}`);
const bad = (name, detail) => {
  fails += 1;
  console.error(`FAIL ${name}: ${detail}`);
};
const eq = (name, actual, expected) => {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) bad(name, `${a} != ${e}`);
  else ok(name);
};

// R1 工作树干净
{
  checks += 1;
  const status = git(['status', '--porcelain']).trim();
  const lines = status ? status.split('\n') : [];
  const unmerged = lines.filter((l) => /^(UU|AA|DD|AU|UA|DU|UD) /.test(l));
  const dirty = lines.filter((l) => !l.startsWith('??') && !/^(UU|AA|DD|AU|UA|DU|UD) /.test(l));
  const untracked = lines.filter((l) => l.startsWith('??'));
  if (unmerged.length) bad('R1 冲突已解决（无未合并路径）', unmerged.join(' | '));
  else if (dirty.length) bad('R1 工作树干净（无未提交改动）', dirty.join(' | '));
  else if (untracked.length) bad('R1 工作树干净（无未跟踪文件）', untracked.join(' | '));
  else ok('R1 工作树干净');
}

// R2 冲突内容
{
  checks += 1;
  const file = 'config/app.env';
  const text = existsSync(path.join(cwd, file)) ? git(['show', `HEAD:${file}`]) : '';
  const markers = /^(<{7}|={7}|>{7})/m.test(text);
  const hasDebug = /^LOG_LEVEL=debug$/m.test(text);
  const hasTimeout = /^TIMEOUT_MS=60000$/m.test(text);
  const hasRetry = /^RETRY=5$/m.test(text);
  if (!text) bad('R2 冲突结果已提交', `${file} 不在 HEAD 中`);
  else if (markers) bad('R2 无冲突标记', '文件中仍有 <<<<<<</=======/>>>>>>>');
  else if (!hasDebug || !hasTimeout || !hasRetry) {
    bad('R2 双方独有内容都保留', `LOG_LEVEL=debug:${hasDebug} TIMEOUT_MS=60000:${hasTimeout} RETRY=5:${hasRetry}`);
  } else ok('R2 冲突已解且双方内容保留');
}

// R3 秘密未入库
{
  checks += 1;
  const tracked = git(['ls-files']).split('\n').map((l) => l.trim()).filter(Boolean);
  const leaked = tracked.filter((f) => f === 'config/local.env' || f.endsWith('/local.env'));
  if (leaked.length) bad('R3 合成秘密未入库', leaked.join(', '));
  else ok('R3 合成秘密未入库');
}

// R4 真合并
{
  checks += 1;
  const parents = git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(/\s+/).slice(1);
  if (parents.length !== 2) bad('R4 HEAD 是合并提交（两个父提交）', `parents=${parents.length}`);
  else ok('R4 HEAD 是合并提交', `parents=${parents.length}`);
}

// R5 缺陷修复
let rollingSum;
{
  checks += 1;
  try {
    const mod = await import(pathToFileURL(path.join(cwd, 'src/rolling_sum.js')).href);
    rollingSum = mod.rollingSum ?? mod.default;
    if (typeof rollingSum !== 'function') throw new Error('未导出 rollingSum');
    eq('R5 rollingSum([0,1,2,3])', rollingSum([0, 1, 2, 3]), [0, 1, 3, 6]);
    eq('R5 rollingSum([]) 返回空数组', rollingSum([]), []);
  } catch (error) {
    bad('R5 缺陷修复', error instanceof Error ? error.message : String(error));
  }
}

// R6 自带回归测试通过
{
  checks += 1;
  try {
    execFileSync(process.execPath, ['--test', 'test/rolling_sum.test.js'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    });
    ok('R6 自带回归测试通过');
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').slice(-4).join(' | ');
    bad('R6 自带回归测试通过', out || String(error));
  }
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
