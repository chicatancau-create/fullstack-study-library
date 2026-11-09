// 构建 G0 固定 fixture 仓库：确定性提交哈希、bare 仓库、bundle、冲突分支、合成秘密、缺陷代码。
// 只用 git CLI，不依赖网络与用户全局配置。
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const DATE = '2026-01-01T00:00:00Z';

export const SPEC = {
  date: DATE,
  author: { name: 'Legacy Maintainer', email: 'legacy@example.test' },
  branches: { base: 'main', feature: 'feature/timeout' },
  conflictFile: 'config/app.env',
  baseLines: ['LOG_LEVEL=info', 'TIMEOUT_MS=30000', 'RETRY=3'],
  featureLines: ['LOG_LEVEL=info', 'TIMEOUT_MS=60000', 'RETRY=5'],
  planted: {
    secretFile: 'config/local.env',
    secretValue: 'SYNTHETIC-NOT-A-REAL-KEY-0001',
    bugFile: 'src/rolling_sum.js',
    dirtyFile: 'README.md',
  },
};

const git = (cwd, args, extraEnv = {}) => execFileSync('git', [
  '-c', `user.name=${SPEC.author.name}`,
  '-c', `user.email=${SPEC.author.email}`,
  '-c', 'commit.gpgsign=false',
  '-c', 'core.autocrlf=false',
  '-c', 'advice.detachedHead=false',
  ...args,
], {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    GIT_AUTHOR_DATE: DATE,
    GIT_COMMITTER_DATE: DATE,
    GIT_CONFIG_NOSYSTEM: '1',
    ...extraEnv,
  },
}).trim();

const write = (dir, rel, text) => {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
};

// 缺陷：应返回 [0,1,3,6]，实际把末位漏掉
const BUGGY_SUM = `export function rollingSum(values) {
  const out = [];
  let total = 0;
  for (let i = 0; i < values.length - 1; i += 1) {
    total += values[i];
    out.push(total);
  }
  return out;
}
`;

const FIXED_SUM = `export function rollingSum(values) {
  const out = [];
  let total = 0;
  for (const value of values) {
    total += value;
    out.push(total);
  }
  return out;
}
`;

const TEST_SUM = `import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingSum } from '../src/rolling_sum.js';

test('rolling sum 累加到末位', () => {
  assert.deepEqual(rollingSum([0, 1, 2, 3]), [0, 1, 3, 6]);
});
`;

/** @param {string} root 工作目录（会被清空重建） */
export function buildFixture(root) {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const work = path.join(root, 'work');

  git(root, ['init', '-q', '-b', SPEC.branches.base, work]);

  write(work, '.gitignore', 'config/local.env\n');
  // 固定行尾：不依赖 Windows 的 core.autocrlf，克隆出来的字节与索引一致
  write(work, '.gitattributes', '* -text\n');
  write(work, 'README.md', '# legacy-service\n\n内部遗留服务，交接时文档已滞后。\n');
  write(work, SPEC.conflictFile, `${SPEC.baseLines.join('\n')}\n`);
  write(work, 'src/rolling_sum.js', BUGGY_SUM);
  write(work, 'test/rolling_sum.test.js', TEST_SUM);
  write(work, 'docs/RUNBOOK.md', '# 运行手册\n\n启动：`node src/server.js`（文档遗留，实际入口已改）。\n');
  // 合成秘密：已列入 .gitignore，但工作区里存在，用于验证“秘密未入库”
  write(work, SPEC.planted.secretFile, `API_KEY=${SPEC.planted.secretValue}\n`);

  git(work, ['add', '.']);
  git(work, ['commit', '-q', '-m', 'chore: 导入遗留服务初始状态']);
  const base = git(work, ['rev-parse', 'HEAD']);

  git(work, ['checkout', '-q', '-b', SPEC.branches.feature]);
  write(work, SPEC.conflictFile, `${SPEC.featureLines.join('\n')}\n`);
  git(work, ['add', SPEC.conflictFile]);
  git(work, ['commit', '-q', '-m', 'feat: 调高超时并加重试']);
  const feature = git(work, ['rev-parse', 'HEAD']);

  git(work, ['checkout', '-q', SPEC.branches.base]);
  // base 侧也改同一行，制造真实冲突（feature 改 TIMEOUT_MS/RETRY，base 改 LOG_LEVEL）
  write(work, SPEC.conflictFile, ['LOG_LEVEL=debug', 'TIMEOUT_MS=30000', 'RETRY=3'].join('\n') + '\n');
  git(work, ['add', SPEC.conflictFile]);
  git(work, ['commit', '-q', '-m', 'fix: 打开 debug 日志']);
  const baseTip = git(work, ['rev-parse', 'HEAD']);

  // 脏工作区：未提交改动 + 未跟踪文件
  write(work, SPEC.planted.dirtyFile, '# legacy-service\n\n内部遗留服务，交接时文档已滞后。（改到一半）\n');
  write(work, 'scratch/note.txt', '临时笔记，不应提交\n');

  const bare = path.join(root, 'legacy.bare.git');
  execFileSync('git', ['clone', '-q', '--bare', work, bare], { encoding: 'utf8' });

  const bundle = path.join(root, 'legacy.bundle');
  git(work, ['bundle', 'create', bundle, '--all']);

  return {
    work,
    bare,
    bundle,
    base,
    feature,
    baseTip,
    spec: SPEC,
    buggySum: BUGGY_SUM,
    fixedSum: FIXED_SUM,
  };
}

if (import.meta.main) {
  const out = process.argv[2] ?? path.join(process.cwd(), 'fixture-build');
  const built = buildFixture(out);
  console.log(JSON.stringify({ bare: built.bare, bundle: built.bundle, base: built.base, feature: built.feature, baseTip: built.baseTip }, null, 2));
}
